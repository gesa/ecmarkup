Prince.trackBoxes = true;

const year = new Date().getFullYear();
const metadata = {
  'ECMA-262': 'ECMA-262, 15th Edition / June 2024, ECMAScript® 2024 Language Specification',
  'ECMA-402':
    'ECMA-402, 11th edition / June 2024, ECMAScript® ' +
    year +
    ' Internationalization API Specification',
};
const specContainer = document.getElementById('spec-container');
const shortname = specContainer.getAttribute('data-shortname');

if (shortname === 'ECMA-262') ecma262fixes();

removeEmuImports();
removeUnusedSections();
improveSectionHeadings();
improveToc();
rearrangeTables();

PDF.pageLayout = 'two-column-right';
PDF.pageMode = 'show-bookmarks';
PDF.duplex = 'duplex-flip-long-edge';
PDF.title = document.title;
PDF.subject = metadata[specContainer.getAttribute('data-shortname')];

Prince.registerPostLayoutFunc(() => {
  const metadataBlock = document.getElementById('metadata-block');
  const intro = document.getElementById('introduction') || document.getElementById('sec-intro');
  const scope = document.getElementById('scope') || document.getElementById('sec-scope');

  specContainer.parentNode.insertBefore(generateFrontCover(), specContainer);
  specContainer.parentNode.insertBefore(generateInsideCover(), specContainer);
  intro.parentNode.insertBefore(generateEcmaCopyrightPage(), scope);
  intro.appendChild(metadataBlock);
  specContainer.insertBefore(document.querySelector('h1.title'), scope);
});

/**
 * Orchestrates the loops to improve toc
 * */
function improveToc() {
  const tocContainer = document.getElementById('toc');
  const toc = tocContainer.querySelector('.toc');

  tocContainer.firstChild.textContent = 'Contents';
  rebuildOl(toc);
}

/**
 * Loops through Table of Contents list items and produces markup optimized for
 * a PDF ToC
 * */
function rebuildOl(ol) {
  Array.from(ol.querySelectorAll(':scope li')).forEach(li => {
    rebuildLi(li);
  });
}

/**
 * Gathers information about a given toc item
 * */
function rebuildLi(li) {
  const sublevel = li.querySelector('ol');

  if (sublevel) {
    rebuildOl(sublevel);
  }

  const anchor = li.firstChild;
  const clauseID = anchor.getAttribute('href').slice(1);

  if (li.querySelector('.secnum') === null) {
    return;
  }

  const clauseNumber = anchor.firstChild.innerHTML;
  const clauseTitle = anchor.getAttribute('title');

  li.insertBefore(renderTocLink(clauseID, clauseNumber, clauseTitle), anchor);
  li.removeChild(anchor);
}

/**
 * Generates link elements for table of contents items
 * */
function renderTocLink(clauseID, clauseNumber, clauseTitle) {
  const nonAnnexSections = ['sec-copyright-and-software-license', 'sec-colophon', 'sec-bibliography'];
  const link = document.createElement('a');
  link.setAttribute('href', '#' + clauseID);
  link.setAttribute('title', clauseTitle);

  if (nonAnnexSections.includes(clauseID)) {
    link.innerHTML = '<span class="secnum">' + clauseTitle + '</span>';

    return link;
  }

  if (/^[A-Z]$/.test(clauseNumber)) {
    const annexType = document.getElementById(clauseID).getAttribute('normative') || 'informative';
    link.innerHTML = '<span class="secnum">Annex ' + clauseNumber + ' <span class="unbold">(' + annexType + ')</span></span> ' + clauseTitle;

    return link;
  }

  if (/^[A-Z]\./.test(clauseNumber)) {
    link.innerHTML = '<span class="secnum">Annex ' + clauseNumber + '</span> ' + clauseTitle;
    return link;
  }

  link.innerHTML = '<span class="secnum">' + clauseNumber + '</span> ' + clauseTitle;
  return link;
}

/**
 * Loops through every clause/annex's h1 and improves the markup
 * */
function improveSectionHeadings() {
  const sectionHeadings = Array.from(specContainer.querySelectorAll('emu-clause > h1, emu-annex > h1'));

  /** these section IDs are emu-annex elements but not functionally annexes */
  const nonAnnexSections = ["sec-copyright-and-software-license", 'sec-colophon', 'sec-bibliography']

  sectionHeadings.forEach(h1 => {
    const numElem = h1.firstChild;
    const section = numElem.innerHTML;
    const parent = h1.parentNode;

    if (/^[A-Z]$/.test(section)) {
      h1.classList.add('annex-title');

      if (nonAnnexSections.includes(parent.id)) {
        numElem.innerHTML = '';
      } else {
        const annexType = parent.getAttribute('normative') || 'informative';

        numElem.innerHTML = 'Annex ' + section + ' <br/><span class="unbold">(' + annexType + ')</span><br/>';
      }
    } else {
      numElem.textContent = section;
    }

    if (numElem.textContent !== '') {
      h1.insertBefore(document.createTextNode(' '), h1.firstChild);
      h1.insertBefore(numElem, h1.firstChild);
    }
  });
}

/**
 * The emu-imports element interferes with a ton of css specificity so we just
 * take everything out and plop it directly into the DOM
 * */
function removeEmuImports() {
  const emuImports = Array.from(specContainer.getElementsByTagName('emu-import'));

  emuImports.forEach(importedMarkup => {
    while (importedMarkup.hasChildNodes()) {
      importedMarkup.parentNode.insertBefore(importedMarkup.childNodes[0], importedMarkup);
    }
    importedMarkup.parentNode.removeChild(importedMarkup);
  });
}

/**
 * Sets up table captions and figcaptions for tables, which provides for
 * continuation table captions.
 * */
function rearrangeTables() {
  const tables = Array.from(document.getElementsByTagName('emu-table'));

  tables.forEach(emuTable => {
    const figcaption = emuTable.getElementsByTagName('figcaption')[0];
    const tableCaptionText = figcaption.innerHTML;
    const table = emuTable.getElementsByTagName('table')[0];
    const captionElement = document.createElement('caption');

    captionElement.innerHTML = tableCaptionText;

    table.insertBefore(captionElement, table.getElementsByTagName('thead')[0]);
    table.appendChild(figcaption);
  });
}

/**
 * Gets rid of elements we don't need in the print version
 * */
function removeUnusedSections() {
  const ecmaLogo = document.getElementById('ecma-logo').parentNode;

  specContainer.removeChild(ecmaLogo);
  document.getElementsByTagName('body')[0].removeChild(document.getElementById('shortcuts-help'));
}

function generateFrontCover() {
  const frontCover = document.createElement('div');

  frontCover.classList.add('full-page-svg');
  frontCover.setAttribute('id', 'front-cover');
  frontCover.innerHTML = '<p>' + metadata[specContainer.getAttribute('data-shortname')] + '</p>';

  return frontCover;
}

function generateInsideCover() {
  const insideCover = document.createElement('div');

  insideCover.classList.add('full-page-svg');
  insideCover.setAttribute('id', 'inside-cover');
  insideCover.innerHTML =
    '<p>Ecma International<br />Rue du Rhone 114 CH-1204 Geneva<br/>Tel: +41 22 849 6000<br/>Fax: +41 22 849 6001<br/>Web: https://www.ecma-international.org<br/>Ecma is the registered trademark of Ecma International.</p>';

  return insideCover;
}

function generateEcmaCopyrightPage() {
  const copyrightNotice = document.createElement('div');


  copyrightNotice.classList.add('copyright-notice');
  copyrightNotice.innerHTML =
    '<p>COPYRIGHT NOTICE</p>\n\n<p>© ' +
    year +
    ' Ecma International</p>\n\n<p>This document may be copied, published and distributed to others, and certain derivative works of it may be prepared, copied, published, and distributed, in whole or in part, provided that the above copyright notice and this Copyright License and Disclaimer are included on all such copies and derivative works. The only derivative works that are permissible under this Copyright License and Disclaimer are: </p>\n\n<p>(i) works which incorporate all or portion of this document for the purpose of providing commentary or explanation (such as an annotated version of the document),</p>\n\n<p>(ii) works which incorporate all or portion of this document for the purpose of incorporating features that provide accessibility,</p>\n\n<p>(iii) translations of this document into languages other than English and into different formats and</p>\n\n<p>(iv) works by making use of this specification in standard conformant products by implementing (e.g. by copy and paste wholly or partly) the functionality therein.</p>\n\n<p>However, the content of this document itself may not be modified in any way, including by removing the copyright notice or references to Ecma International, except as required to translate it into languages other than English or into a different format.</p>\n\n<p>The official version of an Ecma International document is the English language version on the Ecma International website. In the event of discrepancies between a translated version and the official version, the official version shall govern.</p>\n\n<p>The limited permissions granted above are perpetual and will not be revoked by Ecma International or its successors or assigns.</p>\n\n<p>This document and the information contained herein is provided on an &ldquo;AS IS&rdquo; basis and ECMA INTERNATIONAL DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTY THAT THE USE OF THE INFORMATION HEREIN WILL NOT INFRINGE ANY OWNERSHIP RIGHTS OR ANY IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.</p>';

  return copyrightNotice;
}

/**
 * A little content rearranging specifically relevant to 262
 * */
function ecma262fixes() {
  const toc = document.getElementById('toc');

  specContainer.insertBefore(document.getElementById('sec-bibliography'), document.getElementById('sec-colophon'));
  Array.from(toc.getElementsByTagName('a')).forEach(anchor => {
    if (anchor.getAttribute('href') === '#sec-colophon') {
      toc.getElementsByTagName('ol')[0].appendChild(anchor.parentNode);
    }
  });
}

/**
 * @typedef {Object} PrinceBox
 * @property {string} type
 * @property {number} pageNum
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} baseline
 * @property {number} marginTop
 * @property {number} marginBottom
 * @property {number} marginLeft
 * @property {number} marginRight
 * @property {number} paddingTop
 * @property {number} paddingBottom
 * @property {number} paddingLeft
 * @property {number} paddingRight
 * @property {number} borderTop
 * @property {number} borderBottom
 * @property {number} borderLeft
 * @property {number} borderRight
 * @property {string} floatPosition "TOP" or "BOTTOM"
 * @property {PrinceBox[]} children
 * @property {PrinceBox} parent
 * @property {Element|null} element
 * @property {string|null} pseudo
 * @property {string} text
 * @property {string} src
 * @property {CSSStyleSheet} style
 * */
