module.exports = Clause;
var CLAUSE_ELEMS = ['EMU-INTRO', 'EMU-CLAUSE', 'EMU-ANNEX'];
var emd = require('ecmarkdown');

function Clause(spec, node) {
  node._clause = this;

  this.header = node.querySelector('h1');
  if(!this.header) {
    throw new Error("Clause doesn't have header: " + this.node.outerHTML);
  }

  this.spec = spec;
  this.node = node;
  this.parentClause = getParentClause(node);
  this.title = this.header.textContent;
  this.subclauses = [];
  this.id = node.id;

  if(this.parentClause) {
    this.depth = this.parentClause.depth + 1;
    this.parentClause.subclauses.push(this);
  } else {
    this.depth = 0;
    this.spec.subclauses.push(this);
  }

  if(node.nodeName === 'EMU-INTRO') {
    this.number = '';
  } else {
    this.number = spec.getNextClauseNumber(this.depth,
      node.nodeName === 'EMU-ANNEX'
    );
  }

  var aoid = node.getAttribute('aoid');
  if(aoid !== null) {
    if(aoid === "") aoid = this.id;

    this.spec.biblio.ops[aoid] = '#' + this.id;
  }
}

Clause.prototype.build = function() {
  var numElem = this.spec.doc.createElement("span");
  numElem.setAttribute('class', 'secnum');
  numElem.textContent = this.number;
  this.header.insertBefore(numElem, this.header.firstChild);

  processEmd(this);
};

function getParentClause(node) {
  var current = node.parentNode;
  while(current) {
    if(CLAUSE_ELEMS.indexOf(current.nodeName) > -1) return current._clause;
    current = current.parentNode;
  }

  return null;
}

function processEmd(clause) {
  var doc = clause.spec.doc;
  var textNodes = textNodesUnder(clause.node);
  for(var j = 0; j < textNodes.length; j++) {
    var node = textNodes[j];
    if(node.textContent.trim().length === 0) continue;

    // emd strips starting and ending spaces which we want to preserve
    var startSpace = node.textContent.match(/^\s*/)[0];
    var endSpace = node.textContent.match(/\s*$/)[0];

    var template = doc.createElement('template');
    template.innerHTML = startSpace + emd.fragment(node.textContent) + endSpace;

    // Append all the nodes
    var parent = node.parentNode;
    while(template.childNodes.length > 0) {
      node.parentNode.insertBefore(template.childNodes[0], node);
    }

    node.parentNode.removeChild(node);
  }

}

var NO_EMD = ['PRE', 'CODE', 'EMU-CLAUSE', 'EMU-PRODUCTION', 'EMU-ALG'];
function textNodesUnder(node) {
  var all = [];

  for (node=node.firstChild; node; node=node.nextSibling) {
    if (node.nodeType==3) all.push(node);
    else if(NO_EMD.indexOf(node.nodeName) === -1) all = all.concat(textNodesUnder(node));
  }

  return all;
}