const url = "https://openrouter.ai/api/v1/models";
const options = { method: "GET" };

export async function getModel() {
	try {
		const response = await fetch(url, options);
		const json = (await response.json()) as {
			data: Model[];
		};
		const models = json.data;

		const freeModels = models.filter((model) => {
			for (const price of Object.values(model.pricing)) {
				if (price !== "0") {
					return false;
				}
			}

			return true;
		});

		if (freeModels[0]) {
			return freeModels[0];
		}
	} catch (error) {
		console.error(error);
	}

	return null;
}

export interface Model {
	id: string;
	name: string;
	created: number;
	description: string;
	architecture: Architecture;
	top_provider: TopProvider;
	pricing: Pricing;
	canonical_slug: string;
	context_length: number;
	hugging_face_id: string;
	supported_parameters: string[];
}

export interface Architecture {
	input_modalities: string[];
	output_modalities: string[];
	tokenizer: string;
	instruct_type: string;
}

export interface TopProvider {
	is_moderated: boolean;
	context_length: number;
	max_completion_tokens: number;
}

export interface Pricing {
	prompt: string;
	completion: string;
	image: string;
	request: string;
	web_search: string;
	internal_reasoning: string;
	input_cache_read: string;
	input_cache_write: string;
}
