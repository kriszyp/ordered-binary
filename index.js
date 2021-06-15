/*
control character types:
1 - metadata
14 - true
15 - false
17 - number <= -2^48
18 - -2^48 < number < 0
19 - 0 <= number < 2^48
20 - 2^48 <= number
27 - used for escaping control bytes in strings
30 - multipart separator
> 31 normal string characters
*/
const MAX_24_BITS = 2**24
const MAX_32_BITS = 2**32
const MAX_40_BITS = 2**40
const MAX_48_BITS = 2**48

const float64Array = new Float64Array(2)
const uint32Array = new Uint32Array(float64Array.buffer, 0, 4)

/*
* Convert arbitrary scalar values to buffer bytes with type preservation and type-appropriate ordering
*/
exports.writeKey = function(key, target, position) {
  if (typeof key === 'string') {
    let strLength = key.length
    if (strLength < 0x20) {
      let i, c1, c2
      for (i = 0; i < strLength; i++) {
        c1 = key.charCodeAt(i)
        if (c1 < 0x80) {
          target[position++] = c1
        } else if (c1 < 0x800) {
          target[position++] = c1 >> 6 | 0xc0
          target[position++] = c1 & 0x3f | 0x80
        } else if (
          (c1 & 0xfc00) === 0xd800 &&
          ((c2 = key.charCodeAt(i + 1)) & 0xfc00) === 0xdc00
        ) {
          c1 = 0x10000 + ((c1 & 0x03ff) << 10) + (c2 & 0x03ff)
          i++
          target[position++] = c1 >> 18 | 0xf0
          target[position++] = c1 >> 12 & 0x3f | 0x80
          target[position++] = c1 >> 6 & 0x3f | 0x80
          target[position++] = c1 & 0x3f | 0x80
        } else {
          target[position++] = c1 >> 12 | 0xe0
          target[position++] = c1 >> 6 & 0x3f | 0x80
          target[position++] = c1 & 0x3f | 0x80
        }
      }
      return position
    } else {
      return position + target.utf8Write(key, position, 2000)
    }
  } else if (typeof key === 'number') {
    float64Array[0] = key
    let lowInt = uint32Array[0]
    let highInt = uint32Array[1]
    let length
    if (key < 0) {
      target[position + 8] = (~(lowInt & 0xf)) << 4
      targetView.setInt32(1, ~((lowInt >> 4) | (highInt << 28)))
      targetView.setInt32(0, ~(highInt >> 4) | 0x8)
      length = 9
    } else if (lowInt & 0xf || position > 0) {
      target[position + 8] = (lowInt & 0xf) << 4
      length = 9
    } else if (lowInt & 0xfff)
      length = 8
    else
      length = 6
    let targetView = target.dataView || (target.dataView = new DataView(target, 0, target.length))
    // switching order to go to little endian
    targetView.setInt32(1, (lowInt >> 4) | (highInt << 28))
    targetView.setInt32(0, (highInt >> 4) | 0x10)
    return position + length;
  }
  return position
}
exports.toBufferKey = function(key) {
  if (typeof key === 'string') {
    if (key.charCodeAt(0) < 32) {
      return Buffer.from('\u001B' + key) // escape, if there is a control character that starts it
    }
    return Buffer.from(key)
  } else if (typeof key === 'number') {
    let negative = key < 0
    if (negative) {
      key = -key // do our serialization on the positive form
    }

    if (key < MAX_48_BITS) {
      const getByte = (max) => {
        let byte = (key / max) >>> 0
        key = key - byte * max
        return byte
      }
      let bufferArray = [
        negative ? 18 : 19,
        key >= MAX_40_BITS ? getByte(MAX_40_BITS) : 0,
        key >= MAX_32_BITS ? getByte(MAX_32_BITS) : 0,
        key >>> 24,
        key >>> 16 & 255,
        key >>> 8 & 255,
        key & 255,
        0]
      let index = 7
      if (key - (key >>> 0)) {
        // handle the decimal/mantissa
        let asString = key.toString() // we operate with string representation to try to preserve non-binary decimal state
        let exponentPosition = asString.indexOf('e')
        let mantissa
        if (exponentPosition > -1) {
          let exponent = Number(asString.slice(exponentPosition + 2)) - 2
          let i
          for (i = 0; i < exponent; i += 2) {
            bufferArray[index++] = 1 // zeros with continuance bit
          }
          asString = asString.slice(0, exponentPosition).replace(/\./, '')
          if (i == exponent) {
            asString = '0' + asString
          }
        } else {
          asString = asString.slice(asString.indexOf('.') + 1)
        }
        for (var i = 0, l = asString.length; i < l; i += 2) {
          bufferArray[index++] = Number(asString[i] + (asString[i + 1] || 0)) * 2 + 1
        }
        bufferArray[index - 1]-- // remove the continuation bit on the last one
      }
      if (negative) {
        // two's complement
        for (let i = 1, l = bufferArray.length; i < l; i++) {
          bufferArray[i] = bufferArray[i] ^ 255
        }
      }
      return Buffer.from(bufferArray)
    } else {
      throw new Error('Unsupported number ' + key)
    }
  } else if (typeof key === 'boolean') {
    let buffer = Buffer.allocUnsafe(1)
    buffer[0] = key ? 15 : 14 // SHIFT IN/OUT control characters
    return buffer
  } else if (key instanceof Metadata) {
    let buffer = Buffer.allocUnsafe(1)
    buffer[0] = key.code
    return buffer
  } else {
    throw new Error('Can not serialize key ' + key)
  }
}

function fromBufferKey(buffer, multipart) {
  let value, values
  do {
    let consumed, controlByte = buffer[0]
    switch (controlByte) {
      case 18:
        // negative number
        for (let i = 1; i < 7; i++) {
          buffer[i] = buffer[i] ^ 255
        }
        // fall through
      case 19: // number
        value = (buffer[4] << 16) + (buffer[5] << 8) + (buffer[6])
        if (buffer[3]) {
          value += buffer[3] * MAX_24_BITS
        }
        if (buffer[2]) {
          value += buffer[2] * MAX_32_BITS
        }
        if (buffer[1]) {
          value += buffer[1] * MAX_40_BITS
        }
        consumed = 7
        let negative = controlByte === 18
        let decimal
        do {
          decimal = buffer[consumed++]
          if (negative) {
            decimal ^= 255
          }
          if (decimal)
            value += (decimal >> 1) / 100**(consumed - 7)
        } while (decimal & 1)
        if (negative) {
          value = -value
        }
        break
      case 14: // boolean false
        consumed = 1
        value = false
        break
      case 15: // boolean true
        consumed = 1
        value = true
        break
      case 1: case 255:// metadata, return next byte as the code
        consumed = 2
        value = new Metadata(buffer[1])
        break
      default:
        if (controlByte < 27) {
          throw new Error('Unknown control byte ' + controlByte)
        }
        let strBuffer
        if (multipart) {
          consumed = buffer.indexOf(30)
          if (consumed === -1) {
            strBuffer = buffer
            consumed = buffer.length
          } else
            strBuffer = buffer.slice(0, consumed)
        } else
          strBuffer = buffer
        if (strBuffer[strBuffer.length - 1] == 27) {
          // TODO: needs escaping here
          value = strBuffer.toString()
        } else {
          value = strBuffer.toString()
        }
    }
    if (multipart) {
      if (!values) {
        values = [value]
      } else {
        values.push(value)
      }
      if (buffer.length === consumed) {
        return values // done, consumed all the values
      }
      if (buffer[consumed] !== 30)
        throw new Error('Invalid separator byte')
      buffer = buffer.slice(consumed + 1)
    }
  } while (multipart)
  // single value mode
  return value
}

// code can be one byte
function Metadata(code) {
  this.code = code
}
Metadata.prototype.toString = function() {
  return 'Metadata: ' + this.code
}
exports.fromBufferKey = fromBufferKey
exports.Metadata = Metadata
