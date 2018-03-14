const { assert } = require('chai')

const { toBufferKey, fromBufferKey } = require('../index')

function assertBufferComparison(lesser, greater) {
  for (let i = 0; i < lesser.length; i++) {
    if (lesser[i] < greater[i]) {
      return
    }
    if (lesser[i] > (greater[i] || 0)) {
      assert.fail('Byte ' + i + 'should not be ' + lesser[i]  + '>' + greater[i])
    }
  }
}

suite('key buffers', () => {

  test('numbers equivalence', () => {
    assert.strictEqual(fromBufferKey(toBufferKey(4)), 4)
    assert.strictEqual(fromBufferKey(toBufferKey(-4)), -4)
    assert.strictEqual(fromBufferKey(toBufferKey(3.4)), 3.4)
    assert.strictEqual(fromBufferKey(toBufferKey(Math.PI)), Math.PI)
    assert.strictEqual(fromBufferKey(toBufferKey(1503579323825)), 1503579323825)
    assert.strictEqual(fromBufferKey(toBufferKey(1503579323825.3523532)), 1503579323825.3523532)
    assert.strictEqual(fromBufferKey(toBufferKey(-1503579323825)), -1503579323825)
    assert.strictEqual(fromBufferKey(toBufferKey(0.00005032)), 0.00005032)
    assert.strictEqual(fromBufferKey(toBufferKey(-0.00005032)), -0.00005032)
    assert.strictEqual(fromBufferKey(toBufferKey(0.00000000000000000000000005431)), 0.00000000000000000000000005431)
  })
  test('number comparison', () => {
    assertBufferComparison(toBufferKey(4), toBufferKey(5))
    assertBufferComparison(toBufferKey(1503579323824), toBufferKey(1503579323825))
    assertBufferComparison(toBufferKey(1.4), toBufferKey(2))
    assertBufferComparison(toBufferKey(0.000000001), toBufferKey(0.00000001))
    assertBufferComparison(toBufferKey(-4), toBufferKey(3))
    assertBufferComparison(toBufferKey(0), toBufferKey(1))
    assertBufferComparison(toBufferKey(-0.001), toBufferKey(0))
    assertBufferComparison(toBufferKey(-0.001), toBufferKey(-0.000001))
    assertBufferComparison(toBufferKey(-5236532532532), toBufferKey(-5236532532531))
  })
  test('string equivalence', () => {
    assert.strictEqual(fromBufferKey(toBufferKey('4')), '4')
    assert.strictEqual(fromBufferKey(toBufferKey('hello')), 'hello')
  })
  test('string comparison', () => {
    assertBufferComparison(toBufferKey('4'), toBufferKey('5'))
    assertBufferComparison(toBufferKey('and'), toBufferKey('bad'))
    assertBufferComparison(toBufferKey('hello'), toBufferKey('hello2'))
  })
  test('boolean equivalence', () => {
    assert.strictEqual(fromBufferKey(toBufferKey(true)), true)
    assert.strictEqual(fromBufferKey(toBufferKey(false)), false)
  })

  test('multipart equivalence', () => {
    assert.deepEqual(fromBufferKey(
      Buffer.concat([toBufferKey(4), Buffer.from([30]), toBufferKey(5)]), true),
      [4, 5])
    assert.deepEqual(fromBufferKey(
      Buffer.concat([toBufferKey('hello'), Buffer.from([30]), toBufferKey(5.25)]), true),
      ['hello', 5.25])
    assert.deepEqual(fromBufferKey(
      Buffer.concat([toBufferKey(true), Buffer.from([30]), toBufferKey(1503579323825)]), true),
      [true, 1503579323825])
    assert.deepEqual(fromBufferKey(
      Buffer.concat([toBufferKey(-0.2525), Buffer.from([30]), toBufferKey('second')]), true),
      [-0.2525, 'second'])
    assert.deepEqual(fromBufferKey(
      Buffer.concat([toBufferKey(-0.2525), Buffer.from([30]), toBufferKey('2nd'), Buffer.from([30]), toBufferKey('3rd')]), true),
      [-0.2525, '2nd', '3rd'])
  })

  test('multipart comparison', () => {
    assertBufferComparison(
      Buffer.concat([toBufferKey(4), Buffer.from([30]), toBufferKey(5)]),
      Buffer.concat([toBufferKey(5), Buffer.from([30]), toBufferKey(5)]))
    assertBufferComparison(
      Buffer.concat([toBufferKey(4), Buffer.from([30]), toBufferKey(5)]),
      Buffer.concat([toBufferKey(4), Buffer.from([30]), toBufferKey(6)]))
    assertBufferComparison(
      Buffer.concat([toBufferKey('and'), Buffer.from([30]), toBufferKey(5)]),
      Buffer.concat([toBufferKey('and2'), Buffer.from([30]), toBufferKey(5)]))
    assertBufferComparison(
      Buffer.concat([toBufferKey(4), Buffer.from([30]), toBufferKey('and')]),
      Buffer.concat([toBufferKey(4), Buffer.from([30]), toBufferKey('cat')]))
  })

})
