import type Note from './Note';
import type Example from './Example';
import type Spec from './Spec';
import type { AlgorithmType, PartialBiblioEntry, Signature, Type } from './Biblio';
import type { Context } from './Context';

import { ParseError, TypeParser } from './type-parser';
import Builder from './Builder';
import type { ParsedHeader } from './header-parser';
import { formatPreamble, parseStructuredHeaderDl, formatHeader, parseH1 } from './header-parser';
import { offsetToLineAndColumn, traverseWhile } from './utils';

const aoidTypes = [
  'abstract operation',
  'sdo',
  'syntax-directed operation',
  'host-defined abstract operation',
  'implementation-defined abstract operation',
  'numeric method',
];

export const SPECIAL_KINDS_MAP = new Map([
  ['normative-optional', 'Normative Optional'],
  ['legacy', 'Legacy'],
  ['deprecated', 'Deprecated'],
]);
export const SPECIAL_KINDS = [...SPECIAL_KINDS_MAP.keys()];

export function extractStructuredHeader(header: Element): Element | null {
  const dl = traverseWhile(
    header.nextElementSibling,
    'nextElementSibling',
    el => el.nodeName === 'DEL',
  );
  if (dl == null || dl.tagName !== 'DL' || !dl.classList.contains('header')) {
    return null;
  }
  return dl;
}

export default class Clause extends Builder {
  /** @internal */ id: string;
  /** @internal */ namespace: string;
  /** @internal */ parentClause: Clause;
  /** @internal */ header: Element | null;
  /** @internal */ title!: string | null;
  /** @internal */ titleHTML!: string;
  /** @internal */ subclauses: Clause[];
  /** @internal */ number: string;
  /** @internal */ aoid: string | null;
  /** @internal */ type: string | null;
  /** @internal */ notes: Note[];
  /** @internal */ editorNotes: Note[];
  /** @internal */ examples: Example[];
  /** @internal */ readonly effects: string[]; // this is held by identity and mutated by Spec.ts
  /** @internal */ signature: Signature | null;
  /** @internal */ skipGlobalChecks: boolean;
  /** @internal */ skipReturnChecks: boolean;
  isAnnex: boolean;
  isBackMatter: boolean;
  isNormative: boolean;

  constructor(spec: Spec, node: HTMLElement, parent: Clause, number: string) {
    super(spec, node);
    this.parentClause = parent;
    this.id = node.getAttribute('id')!;
    this.number = number;
    this.subclauses = [];
    this.notes = [];
    this.editorNotes = [];
    this.examples = [];
    this.effects = [];
    this.skipGlobalChecks = false;
    this.skipReturnChecks = false;
    this.isAnnex = node.nodeName === 'EMU-ANNEX';
    this.isBackMatter = this.isAnnex && node.hasAttribute('back-matter');
    this.isNormative = !this.isAnnex || node.hasAttribute('normative');

    // namespace is either the entire spec or the parent clause's namespace.
    let parentNamespace = spec.namespace;
    if (parent) {
      parentNamespace = parent.namespace;
    }

    if (node.hasAttribute('namespace')) {
      this.namespace = node.getAttribute('namespace')!;
      spec.biblio.createNamespace(this.namespace, parentNamespace);
    } else {
      this.namespace = parentNamespace;
    }

    this.aoid = node.getAttribute('aoid');
    if (this.aoid === '') {
      // <emu-clause id=foo aoid> === <emu-clause id=foo aoid=foo>
      this.aoid = node.id;
    }

    this.type = node.getAttribute('type');
    if (this.type === '') {
      this.type = null;
    }

    this.signature = null;
    const header = traverseWhile(
      this.node.firstElementChild,
      'nextElementSibling',
      // skip <del> and oldids
      el => el.nodeName === 'DEL' || (el.nodeName === 'SPAN' && el.children.length === 0),
    );
    let headerH1 = traverseWhile(header, 'firstElementChild', el => el.nodeName === 'INS', {
      once: true,
    });
    if (headerH1 == null) {
      this.spec.warn({
        type: 'node',
        ruleId: 'missing-header',
        message: `could not locate header element`,
        node: this.node,
      });
      headerH1 = null;
    } else if (headerH1.tagName !== 'H1') {
      this.spec.warn({
        type: 'node',
        ruleId: 'missing-header',
        message: `could not locate header element; found <${header!.tagName.toLowerCase()}> before any <h1>`,
        node: header!,
      });
      headerH1 = null;
    } else {
      this.buildStructuredHeader(headerH1, header!);
    }
    this.header = headerH1;
    if (headerH1 == null) {
      this.title = 'UNKNOWN';
      this.titleHTML = 'UNKNOWN';
    }
  }

  /** @internal */ buildStructuredHeader(header: Element, headerSurrogate: Element = header) {
    const dl = extractStructuredHeader(headerSurrogate);
    if (dl === null) {
      return;
    }
    // if we find such a DL, treat this as a structured header

    const type = this.type;

    let headerSource;
    const headerLocation = this.spec.locate(header);
    if (headerLocation != null) {
      headerSource = headerLocation.source.slice(
        headerLocation.startTag.endOffset,
        headerLocation.endTag.startOffset,
      );
    } else {
      headerSource = header.innerHTML;
    }

    const parseResult = parseH1(headerSource);
    if (parseResult.type !== 'failure') {
      try {
        this.signature = parsedHeaderToSignature(parseResult);
      } catch (e) {
        if (e instanceof ParseError) {
          const { line, column } = offsetToLineAndColumn(headerSource, e.offset);
          this.spec.warn({
            type: 'contents',
            ruleId: 'type-parsing',
            message: e.message,
            node: header,
            nodeRelativeLine: line,
            nodeRelativeColumn: column,
          });
        } else {
          throw e;
        }
      }
    }
    const { name, formattedHeader, formattedParams, formattedReturnType } = formatHeader(
      this.spec,
      header,
      parseResult,
    );
    if (type === 'numeric method' && name != null && !name.includes('::')) {
      this.spec.warn({
        type: 'contents',
        ruleId: 'numeric-method-for',
        message: 'numeric methods should be of the form `Type::operation`',
        node: header,
        nodeRelativeLine: 1,
        nodeRelativeColumn: 1,
      });
    }
    if (type === 'sdo' && (formattedHeader ?? header.innerHTML).includes('(')) {
      // SDOs are rendered without parameter lists in the header, for the moment
      const currentHeader = formattedHeader ?? header.innerHTML;
      header.innerHTML = (
        currentHeader.substring(0, currentHeader.indexOf('(')) +
        currentHeader.substring(currentHeader.lastIndexOf(')') + 1)
      ).trim();
      if (
        header.children.length === 1 &&
        ['INS', 'DEL', 'MARK'].includes(header.children[0].tagName)
      ) {
        header.children[0].innerHTML = header.children[0].innerHTML.trim();
      }
    } else if (formattedHeader != null) {
      header.innerHTML = formattedHeader;
    }

    const {
      description,
      for: _for,
      effects,
      redefinition,
      skipGlobalChecks,
      skipReturnChecks,
    } = parseStructuredHeaderDl(this.spec, type, dl);

    const paras = formatPreamble(
      this.spec,
      this.node,
      dl,
      type,
      name ?? 'UNKNOWN',
      formattedParams ?? 'UNPARSEABLE ARGUMENTS',
      formattedReturnType,
      _for,
      description,
    );
    dl.replaceWith(...paras);

    if (!redefinition) {
      if (this.node.hasAttribute('aoid')) {
        this.spec.warn({
          type: 'attr',
          ruleId: 'header-format',
          message: `nodes with structured headers should not include an AOID`,
          node: this.node,
          attr: 'aoid',
        });
      } else if (name != null && type != null && aoidTypes.includes(type)) {
        this.node.setAttribute('aoid', name);
        this.aoid = name;
      }
    }

    this.skipGlobalChecks = skipGlobalChecks;
    this.skipReturnChecks = skipReturnChecks;

    this.effects.push(...effects);
    for (const effect of effects) {
      if (!this.spec._effectWorklist.has(effect)) {
        this.spec._effectWorklist.set(effect, []);
      }
      this.spec._effectWorklist.get(effect)!.push(this);
    }
  }

  /** @internal */ buildNotes() {
    if (this.notes.length === 1) {
      this.notes[0].build();
    } else {
      // pass along note index
      this.notes.forEach((note, i) => {
        note.build(i + 1);
      });
    }

    this.editorNotes.forEach(note => note.build());
  }

  /** @internal */ buildExamples() {
    if (this.examples.length === 1) {
      this.examples[0].build();
    } else {
      // pass along example index
      this.examples.forEach((example, i) => {
        example.build(i + 1);
      });
    }
  }

  canHaveEffect(effectName: string) {
    // The following effects are runtime only:
    //
    // user-code: Only runtime can call user code.
    if (this.title !== null && this.title.startsWith('Static Semantics:')) {
      if (effectName === 'user-code') return false;
    }
    return true;
  }

  static async enter({ spec, node, clauseStack, clauseNumberer }: Context) {
    if (!node.id) {
      spec.warn({
        type: 'node',
        ruleId: 'missing-id',
        message: "clause doesn't have an id",
        node,
      });
    }

    let nextNumber = '';
    if (node.nodeName !== 'EMU-INTRO') {
      nextNumber = clauseNumberer.next(clauseStack, node);
    }
    const parent = clauseStack[clauseStack.length - 1] || null;

    const clause = new Clause(spec, node, parent, nextNumber);

    if (parent) {
      parent.subclauses.push(clause);
    } else {
      spec.subclauses.push(clause);
    }

    clauseStack.push(clause);
  }

  static exit({ node, spec, clauseStack, inAlg, currentId }: Context) {
    const clause = clauseStack[clauseStack.length - 1];

    clause.buildExamples();
    clause.buildNotes();

    // prettier-ignore
    const attributes = SPECIAL_KINDS
      .filter(kind => node.hasAttribute(kind))
      .map(kind => SPECIAL_KINDS_MAP.get(kind));
    if (attributes.length > 0) {
      const tag = spec.doc.createElement('div');
      tag.className = 'attributes-tag';
      const text = attributes.join(', ');
      const contents = spec.doc.createTextNode(text);
      tag.append(contents);
      node.prepend(tag);

      // we've already walked past the text node, so it won't get picked up by the usual process for autolinking
      spec._textNodes[clause.namespace] = spec._textNodes[clause.namespace] || [];
      spec._textNodes[clause.namespace].push({
        node: contents,
        clause,
        inAlg,
        currentId,
      });
    }

    // clauses are always at the spec-level namespace.
    const entry: PartialBiblioEntry = {
      type: 'clause',
      id: clause.id,
      aoid: clause.aoid,
      title: clause.title!,
      titleHTML: clause.titleHTML,
      number: clause.number,
    };

    if (clause.aoid) {
      const existing = spec.biblio.keysForNamespace(spec.namespace);
      if (existing.has(clause.aoid)) {
        spec.warn({
          type: 'node',
          node,
          ruleId: 'duplicate-definition',
          message: `duplicate definition ${JSON.stringify(clause.aoid)}`,
        });
      } else {
        const signature = clause.signature;
        let kind: AlgorithmType | undefined =
          clause.type != null && aoidTypes.includes(clause.type)
            ? (clause.type as AlgorithmType)
            : undefined;
        // @ts-ignore
        if (kind === 'sdo') {
          kind = 'syntax-directed operation';
        }
        const op: PartialBiblioEntry = {
          type: 'op',
          aoid: clause.aoid,
          refId: clause.id,
          kind,
          signature,
          effects: clause.effects,
          _node: clause.node,
          _skipReturnChecks: clause.skipReturnChecks,
        };
        if (clause.skipGlobalChecks) {
          op.skipGlobalChecks = true;
        }
        if (
          signature?.return?.kind === 'union' &&
          signature.return.types.some(e => e.kind === 'completion') &&
          signature.return.types.some(e => e.kind !== 'completion')
        ) {
          spec.warn({
            type: 'node',
            node: clause.header!,
            ruleId: 'completion-union',
            message: `algorithms should return either completions or things which are not completions, never both`,
          });
        }
        spec.biblio.add(op, spec.namespace);
      }
    }
    spec.biblio.add(entry, spec.namespace);

    clauseStack.pop();
  }

  getSecnumHTML() {
    if (!this.number || this.isBackMatter) return '';
    if (this.isAnnex) {
      const isInnerAnnex = this.node.parentElement?.nodeName === 'EMU-ANNEX';
      if (isInnerAnnex) {
        return `<span class="secnum">${this.number}</span> `;
      } else {
        return `<span class="secnum">Annex ${this.number} <span class="annex-kind">(${this.isNormative ? 'normative' : 'informative'})</span></span> `;
      }
    } else {
      return `<span class="secnum">${this.number}</span> `;
    }
  }

  static elements = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];
  static linkElements = Clause.elements;
}

function parseType(type: string, offset: number): Type {
  try {
    return TypeParser.parse(type);
  } catch (e) {
    if (e instanceof ParseError) {
      e.offset += offset;
    }
    throw e;
  }
}

function parsedHeaderToSignature(parsedHeader: ParsedHeader): Signature {
  const ret = {
    parameters: parsedHeader.params
      .filter(p => p.wrappingTag !== 'del')
      .map(p => ({
        name: p.name,
        type: p.type == null ? null : parseType(p.type, p.typeOffset),
      })),
    optionalParameters: parsedHeader.optionalParams
      .filter(p => p.wrappingTag !== 'del')
      .map(p => ({
        name: p.name,
        type: p.type == null ? null : parseType(p.type, p.typeOffset),
      })),
    return:
      parsedHeader.returnType == null
        ? null
        : parseType(parsedHeader.returnType, parsedHeader.returnOffset),
  };

  return ret;
}
