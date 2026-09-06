const assert = require('node:assert/strict');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Owner production authority: navigation only, never an API/asset origin.
const SELLER_URL = 'https://novastore-stage.com';
const navigationClasses = ['seller-recruitment-action', 'mobile-seller-recruitment'];
const keyName = (node) => node?.name || node?.value;

function hrefCall(reference) {
  const property = reference.parentPath;
  assert(property.isObjectProperty() && !property.node.computed && keyName(property.node.key) === 'href', 'Seller URL must be an href value only');
  const object = property.parentPath;
  const call = object.parentPath;
  assert(object.isObjectExpression() && call.isCallExpression() && call.node.arguments[1] === object.node, 'Seller href must belong to JSX props');
  const callee = call.node.callee;
  assert(callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier' && ['jsx', 'jsxs'].includes(keyName(callee.property)), 'Seller href must be passed to the JSX runtime, never a request function');
  return { object, call };
}

function assertAnchorForwarder(component, scope) {
  const binding = scope.getBinding(component.name);
  assert(binding?.constant && binding.path.isFunctionDeclaration(), 'Seller header must use a fixed anchor component');
  const fn = binding.path;
  const parameter = fn.node.params[0];
  assert(parameter?.type === 'ObjectPattern', 'Seller anchor props must be explicit');
  const href = parameter.properties.find((p) => p.type === 'ObjectProperty' && !p.computed && keyName(p.key) === 'href');
  assert(href?.value.type === 'Identifier', 'Seller anchor must accept href directly');
  const hrefBinding = fn.scope.getBinding(href.value.name);
  assert(hrefBinding?.constant && hrefBinding.referencePaths.length === 1, 'Seller anchor href cannot be used for runtime requests');
  const { call } = hrefCall(hrefBinding.referencePaths[0]);
  assert(call.node.arguments[0]?.type === 'StringLiteral' && call.node.arguments[0].value === 'a', 'Seller component must forward href only to an anchor');
}

// Return inspection text with ONLY the proven navigation literal redacted.
// Original artifact bytes are never changed. All remaining origins stay forbidden.
function inspectSellerNavigation(html) {
  let approvedRange;
  let literals = 0;
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const source = match[1];
    const offset = match.index + match[0].indexOf('>') + 1;
    const ast = parse(source, { sourceType: 'unambiguous' });
    traverse(ast, {
      StringLiteral(p) {
        if (p.node.value !== SELLER_URL) return;
        literals += 1;
        assert(p.parentPath.isVariableDeclarator() && p.parentPath.node.init === p.node && p.parentPath.node.id.type === 'Identifier', 'Seller destination must be one fixed binding');
        const binding = p.scope.getBinding(p.parentPath.node.id.name);
        assert(binding?.constant && binding.referencePaths.length === 2, 'Seller destination must have exactly two navigation uses');
        const classes = binding.referencePaths.map((reference) => {
          const { object, call } = hrefCall(reference);
          const cls = object.node.properties.find((prop) => prop.type === 'ObjectProperty' && !prop.computed && keyName(prop.key) === 'className');
          assert(cls?.value.type === 'StringLiteral', 'Seller navigation class must be fixed');
          const component = call.node.arguments[0];
          if (cls.value.value === 'mobile-seller-recruitment') {
            assert(component?.type === 'StringLiteral' && component.value === 'a', 'Mobile Seller destination must be an anchor');
          } else {
            assert(cls.value.value === 'seller-recruitment-action' && component?.type === 'Identifier', 'Unexpected Seller navigation surface');
            assertAnchorForwarder(component, reference.scope);
          }
          return cls.value.value;
        });
        assert.deepEqual(classes.sort(), [...navigationClasses].sort(), 'Both exact Seller navigation surfaces are required');
        approvedRange = [offset + p.node.start, offset + p.node.end];
      },
    });
  }
  assert.equal(literals, 1, 'Production HTML must contain one fixed Seller destination literal');
  const [start, end] = approvedRange;
  assert(['"' + SELLER_URL + '"', "'" + SELLER_URL + "'"].includes(html.slice(start, end)), 'Seller destination must be literal, not escaped or assembled');
  return html.slice(0, start) + '"approved-seller-navigation"' + html.slice(end);
}

function assertProductionOrigins(content, { generatedHtml = false } = {}) {
  const inspected = generatedHtml ? inspectSellerNavigation(content) : content;
  const origins = [...inspected.matchAll(/https?:\/\/[^"'`\s<>\)]+/g)].map((match) => match[0]);
  const unexpected = origins.filter((origin) => !origin.startsWith('http://www.w3.org/'));
  assert.equal(unexpected.length, 0, 'Production closure contains an unapproved external origin');
}

module.exports = { SELLER_URL, inspectSellerNavigation, assertProductionOrigins };
