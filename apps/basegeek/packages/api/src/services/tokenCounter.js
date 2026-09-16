import { encoding_for_model } from 'tiktoken'
import logger from '../lib/logger.js'

let encoder = null
let encoderLoadErrorLogged = false

function getEncoder() {
	if (encoder) {
		return encoder
	}

	try {
		encoder = encoding_for_model('gpt-4o-mini')
	} catch (error) {
		if (!encoderLoadErrorLogged) {
			logger.warn({ err: error }, '[TokenCounter] Failed to load tiktoken encoder, using heuristic fallback')
			encoderLoadErrorLogged = true
		}
		encoder = null
	}

	return encoder
}

export function countTextTokens(text = '') {
	if (!text) {
		return 0
	}

	const encoderInstance = getEncoder()

	if (encoderInstance) {
		try {
			return encoderInstance.encode(text).length
		} catch (error) {
			if (!encoderLoadErrorLogged) {
				logger.warn({ err: error }, '[TokenCounter] Encoding failed, using heuristic fallback')
				encoderLoadErrorLogged = true
			}
		}
	}

	// Fallback heuristic
	return Math.ceil(text.length / 4)
}

export function extractTextContent(content) {
	if (typeof content === 'string') {
		return content
	}

	if (Array.isArray(content)) {
		return content
			.map((block) => {
				if (!block) return ''
				if (typeof block === 'string') return block
				if (typeof block === 'object') {
					if ('text' in block && typeof block.text === 'string') {
						return block.text
					}
					if ('content' in block && typeof block.content === 'string') {
						return block.content
					}
					// An image part contributes no TEXT. Falling through to
					// `JSON.stringify` below would count its base64 payload as
					// prose: a single ~750KB page image reads as roughly 190,000
					// tokens, which clears every provider's context threshold on
					// its own and sends the call into summarization — where the
					// image does not survive. The count has to be wrong in the
					// safe direction.
					//
					// This does NOT mean an image is free. Providers do charge
					// tokens for one, at a rate that depends on the model and the
					// image's dimensions rather than on its byte length, and
					// nothing here models that yet. Under-counting risks a real
					// context overflow the provider reports; over-counting broke
					// the feature outright.
					if (block.type === 'image') {
						return ''
					}
				}
				return JSON.stringify(block)
			})
			.filter(Boolean)
			.join('\n')
	}

	if (content && typeof content === 'object') {
		if ('text' in content && typeof content.text === 'string') {
			return content.text
		}
		if ('content' in content && typeof content.content === 'string') {
			return content.content
		}
	}

	return typeof content === 'undefined' || content === null ? '' : String(content)
}

export function countMessageTokens(messages = []) {
	if (!Array.isArray(messages)) {
		return 0
	}

	return messages.reduce((sum, message) => {
		const text = extractTextContent(message?.content)
		return sum + countTextTokens(text)
	}, 0)
}
