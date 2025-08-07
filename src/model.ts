import { registerSlashCommands } from "./discord.js";

const modelsURL = "https://openrouter.ai/api/v1/models";
const endpointsURL = (model: Model) =>
	`https://openrouter.ai/api/v1/models/${model.canonical_slug}/endpoints`;
const options = { method: "GET" };

export let models = await getModels();

export function blacklistModel(modelID: string) {
	models = models.filter((model) => model.id !== modelID);
}

export function leastExpensive(models: Model[]) {
	const lowestPrice = getPrice(
		models.reduce((prev, curr) => {
			const prevPrice = getPrice(prev);
			const currPrice = getPrice(curr);
			return prevPrice < currPrice ? prev : curr;
		}),
	);

	return models.find((model) => getPrice(model) === lowestPrice);
}

function getPrice(model: Model) {
	return (
		parseFloat(model.pricing.prompt || "0") +
		parseFloat(model.pricing.completion || "0")
	);
}

export function getModel(id: string | undefined) {
	let model: Model | undefined;
	if (id) {
		model = models.find((m) => m.id === id);
		if (model) return model;
	}

	model = models.find((m) => m.id === process.env.DEFAULT_MODEL);
	if (model) return model;

	const le = leastExpensive(models);
	if (le) return le;

	throw new Error("No models available");
}

async function getModels() {
	try {
		const response = await fetch(modelsURL, options);
		const json = (await response.json()) as {
			data: Model[];
		};
		let models = json.data;

		// Created within the last 6 months
		const sixMonthsAgo = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;
		models = models.filter((model) => model.created * 1000 > sixMonthsAgo);

		// High context length
		models = models.filter((model) => model.context_length >= 100000);

		// Includes text output
		models = models.filter((model) => {
			return (
				model.architecture.output_modalities.includes("text") &&
				model.architecture.input_modalities.includes("text")
			);
		});

		// Not too expensive
		models = models.filter((model) => {
			if (model.pricing.prompt && parseFloat(model.pricing.prompt) > 0.000015) {
				return false;
			}

			if (
				model.pricing.completion &&
				parseFloat(model.pricing.completion) > 0.000075
			) {
				return false;
			}

			if (model.pricing.image && parseFloat(model.pricing.image) > 0.024) {
				return false;
			}

			return true;
		});

		// From a major provider
		const majorProviders = [
			"anthropic",
			"google",
			"x-ai",
			"deepseek",
			"meta-llama",
			"openai",
		];
		models = models.filter((model) => {
			return majorProviders.some((provider) =>
				model.id.toLowerCase().startsWith(provider),
			);
		});

		// remove duplicates
		models = models.filter((model, index, self) => {
			return (
				index ===
				self.findIndex((m) => m.canonical_slug === model.canonical_slug)
			);
		});

		// Remove preview, experimental & beta models
		models = models.filter((model) => {
			const name = model.name.toLowerCase();

			return !(
				name.includes("preview") ||
				name.toLowerCase().includes("experimental") ||
				name.toLowerCase().includes("beta")
			);
		});

		// Don't repeat name
		models.forEach((model) => {
			const [providerName, modelName] = model.name.split(": ", 2);
			if (!providerName || !modelName) return;

			if (modelName.toLowerCase().includes(providerName.toLowerCase())) {
				const regEx = new RegExp(providerName, "ig");
				model.name = `${providerName}: ${modelName.replace(regEx, "")}`;
			}
		});

		// Get endpoints
		for (const [i, model] of models.entries()) {
			if (!models[i]) continue;

			const response = await fetch(endpointsURL(model), options);
			if (!response.ok) {
				console.error(`Failed to fetch endpoints for model ${model.id}`);
				continue;
			}

			const json = (await response.json()) as {
				data: {
					endpoints?: Endpoint[];
				};
			};
			if (!json.data.endpoints) {
				console.log(`No endpoints found for model ${model.id}`);
				continue;
			}

			// Filter out OpenAI endpoints because they require a different API key
			models[i].endpoints = json.data.endpoints.filter(
				(endpoint) =>
					endpoint.provider_name !== "OpenAI" && endpoint.status === 0,
			);
		}

		// Remove models without any endpoints
		models = models.filter(
			(model) => model.endpoints && model.endpoints.length > 0,
		);

		return models;
	} catch (error) {
		console.error(error);
	}

	return [];
}

// Periodically refresh the available models
setInterval(
	async () => {
		const newModels = await getModels();
		const choicesNew = newModels
			.slice(0, 25)
			.map((m) => m.id)
			.sort();
		const choicesOld = models
			.slice(0, 25)
			.map((m) => m.id)
			.sort();
		models = newModels;

		if (JSON.stringify(choicesNew) !== JSON.stringify(choicesOld)) {
			await registerSlashCommands();
		}
	},
	1 * 60 * 60 * 1000,
); // Refresh every hour

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
	endpoints?: Endpoint[];
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

export interface Endpoint {
	name: string;
	context_length: number;
	pricing: Pricing;
	provider_name: string;
	tag: string;
	quantization: string;
	max_completion_tokens: number;
	max_prompt_tokens: number;
	supported_parameters: string[];
	status: number;
	uptime_last_30m: number;
}
