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
const float64Array = new Float64Array(2)
const uint32Array = new Uint32Array(float64Array.buffer, 0, 4)

/*
* Convert arbitrary scalar values to buffer bytes with type preservation and type-appropriate ordering
*/
exports.writeKey = function writeKey(key, target, position, inArray) {
	let type = typeof key
	if (type === 'string') {
		let strLength = key.length
//		if (strLength < 0x40) {
			let i, c1, c2
			for (i = 0; i < strLength; i++) {
				c1 = key.charCodeAt(i)
				if (c1 < 0x80) {
					target[position++^3] = c1
				} else if (c1 < 0x800) {
					target[position++^3] = c1 >> 6 | 0xc0
					target[position++^3] = c1 & 0x3f | 0x80
				} else if (
					(c1 & 0xfc00) === 0xd800 &&
					((c2 = key.charCodeAt(i + 1)) & 0xfc00) === 0xdc00
				) {
					c1 = 0x10000 + ((c1 & 0x03ff) << 10) + (c2 & 0x03ff)
					i++
					target[position++^3] = c1 >> 18 | 0xf0
					target[position++^3] = c1 >> 12 & 0x3f | 0x80
					target[position++^3] = c1 >> 6 & 0x3f | 0x80
					target[position++^3] = c1 & 0x3f | 0x80
				} else {
					target[position++^3] = c1 >> 12 | 0xe0
					target[position++^3] = c1 >> 6 & 0x3f | 0x80
					target[position++^3] = c1 & 0x3f | 0x80
				}
			}
			// end at 32-bit alignment, and ensure a trailing zero if we are in an array
			strLength = (position + (inArray ? 4 : 3)) & 0xfffffc
			for (; position < strLength; position++)
				target[position++^3] = 0 // fill in remaining with zeros
			return position
/*		} else {
			return position + target.utf8Write(key, position, 2000)
		}*/
	} else if (type === 'number') {
		float64Array[0] = key
		let lowInt = uint32Array[0]
		let highInt = uint32Array[1]
		let length
		let targetUint32 = target.uint32Array || ()
		let wordPosition = position >> 2
		if (key >= 1) {
			if (key > 1E150) {
				targetUint32[wordPosition++] = 0x1e000000
				position += 4
				targetUint32[wordPosition] = highInt
			} else
				targetUint32[wordPosition] = highInt - 56
			if (lowInt > 0 && !inArray) {
				targetUint32[wordPosition + 1] = lowInt
				return position + 8
			} else
				return position + 4
		} else if (key >= 0) {
			targetUint32[wordPosition++] = 0x6000000
			targetUint32[wordPosition++] = highInt
			targetUint32[wordPosition] = lowInt
			return position + 12
		} else { // negative
			targetUint32[wordPosition] = highInt - 56
			if (key < -1E150) {
				targetUint32[wordPosition++] = 0x1e000000
				position += 4
				targetUint32[wordPosition] = ~highInt
			} else
				targetUint32[wordPosition] = ~highInt - 56
			targetUint32[wordPosition + 1] = ~lowInt
			return position + 8
		}
	} else if (type === 'object') {
		if (key) {
			if (key instanceof Array) {
				for (let i = 0, l = key.length; i < l; i++) {
					if (i > 0)
						target[position++] = 0
					position = writeKey(key[i], target, position)
				}
			} else if (key instanceof Uint8Array) {
				target.set(position, key)
				return position + key.length
			}
		} else // null
			target[position++] = 5
	} else if (type === 'boolean') {
		target[position++] = key ? 7 : 6
	} else if (type === 'bigint') {
		return writeKey(Number(key), target, position)
	}
	return position
}
exports.readKey = function readKey(source, position, end) {
	let wordPosition = position >> 2
	let wordEnd = end >> 2
	let string
	let nullTerminated
	let asInt = sourceUint32[wordPosition]
	if (asInt > 0x1f000000) {
	do {
		let asInt = sourceUint32[wordPosition]
		if (asInt & -0x808080)
			return asUtf8()
		let next
		if (asInt & -0x8f000000 === 0) {
			nullTerminated = true
			if (asInt & 0xff0000 === 0) {
				if (asInt & 0xff00 === 0) {
					if (asInt & 0xff00 === 0)
						next = String.fromCharCode(asInt & 0xff, (asInt >> 8) & 0xff)
					else
						next = ''
				} else {
					next = String.fromCharCode(asInt & 0xff, (asInt >> 8) & 0xff)
				}
			}
			next = String.fromCharCode(asInt & 0xff, (asInt >> 8) & 0xff, (asInt >> 16) & 0xff)
			wordPosition++
			break
		} else {
			next = String.fromCharCode(asInt & 0xff, (asInt >> 8) & 0xff, (asInt >> 16) & 0xff, asInt >>> 24)			
		}
		string = string ? string + next : next
	} while (++wordPosition < wordEnd)
	if (nullTerminated && wordPosition < wordEnd) {
		let next = readKey(source, wordPosition << 2, end)
		if (next instanceof Array)
			return [string, ...next]
		return [string, next]
	}
}
exports.toBufferKey = function(key) {
	let buffer = Buffer.alloc(2048)
	return buffer.slice(0, writeKey(key, buffer, 0, false))
}

function fromBufferKey(buffer, multipart) {
	return readKey(buffer, 0, 2048)
}
exports.fromBufferKey = fromBufferKey
