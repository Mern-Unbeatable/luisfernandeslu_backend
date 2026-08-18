import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mapCategoryNode,
  categoryPathNodes,
  categoryPathStrict,
  categoryLabels,
  categoryFilter,
} from '../../src/shared/catalog.js'

const productType = {
  id: 'pt',
  slug: 'x1__cimento-32',
  name: 'Cimento 32,5',
  parentCategory: {
    id: 'sub',
    slug: 'x2__cimentos',
    name: 'Cimentos',
    parentCategory: { id: 'root', slug: 'x3__materiais', name: 'Materiais' },
  },
}

test('mapCategoryNode exposes the public slug only', () => {
  assert.deepEqual(mapCategoryNode(productType), {
    id: 'pt',
    slug: 'cimento-32',
    name: 'Cimento 32,5',
  })
  assert.equal(mapCategoryNode(null), null)
})

test('categoryPathNodes returns all three levels', () => {
  const path = categoryPathNodes(productType)
  assert.equal(path.category.id, 'root')
  assert.equal(path.subCategory.id, 'sub')
  assert.equal(path.productType.id, 'pt')
})

test('categoryPathNodes shifts a partial chain up', () => {
  const sub = { id: 'sub', parentCategory: { id: 'root' } }
  assert.deepEqual(categoryPathNodes(sub), {
    category: { id: 'root' },
    subCategory: sub,
    productType: null,
  })

  const root = { id: 'root' }
  assert.deepEqual(categoryPathNodes(root), {
    category: root,
    subCategory: null,
    productType: null,
  })
  assert.deepEqual(categoryPathNodes(null), {
    category: null,
    subCategory: null,
    productType: null,
  })
})

test('categoryPathStrict only accepts a complete chain', () => {
  const path = categoryPathStrict({ category: productType })
  assert.equal(path.category.id, 'root')
  assert.equal(path.productType.id, 'pt')
  assert.equal(categoryPathStrict({ category: { id: 'a' } }), null)
  assert.equal(categoryPathStrict({}), null)
})

test('categoryLabels pairs the parent name with the leaf name', () => {
  assert.deepEqual(categoryLabels(productType), {
    category: 'Cimentos',
    material: 'Cimento 32,5',
  })
})

test('categoryLabels handles a root-only category', () => {
  assert.deepEqual(categoryLabels({ name: 'Materiais' }), {
    category: 'Materiais',
    material: null,
  })
  assert.deepEqual(categoryLabels(null), { category: null, material: null })
})

test('categoryFilter matches any level of the tree', () => {
  assert.deepEqual(categoryFilter('c1'), [
    { categoryId: 'c1' },
    { category: { parentCategoryId: 'c1' } },
    { category: { parentCategory: { parentCategoryId: 'c1' } } },
  ])
  assert.equal(categoryFilter(null), null)
})
