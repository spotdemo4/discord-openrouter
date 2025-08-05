import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { ChannelType, Client, Events, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { respond } from "./message.js";
import { getModel } from "./models.js";

dotenv.config();

// Create a new client instance
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

// Initialize the router
if (!process.env.OPENROUTER_API_KEY) {
	console.error("OPENROUTER_API_KEY is not set");
	process.exit(1);
}
const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
});

// Fetch the model
const newModel = await getModel();
if (!newModel) {
	console.error("No free model found");
	process.exit(1);
}
let model = newModel;
let router = openrouter(model.id);

// Periodically refresh the router
setInterval(
	async () => {
		const newModel = await getModel();
		if (newModel && newModel.id !== model.id) {
			model = newModel;
			router = openrouter(model.id);
			console.log(`Switched to model ${model.name} (${model.id})`);
		}
	},
	1 * 60 * 60 * 1000,
); // Refresh every hour

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Logged in as ${readyClient.user.tag}`);
	console.log(`Using model ${model.name} (${model.id})`);
});

client.on(Events.MessageCreate, async (message) => {
	if (message.author.bot) return; // Ignore bot messages
	if (!client.user) return; // Ensure the client user is available

	// Mentions the bot
	if (message.mentions.users.has(client.user.id)) {
		await respond(client, message, router);
		return;
	}

	// A reply to the bot
	if (message.reference) {
		const referencedMessage = await message.fetchReference();
		if (referencedMessage.author.id !== client.user.id) return; // Ignore if the referenced message is not from the bot

		await respond(client, message, router);
		return;
	}

	// In a thread
	if (
		message.channel.type === ChannelType.PublicThread ||
		message.channel.type === ChannelType.PrivateThread
	) {
		await respond(client, message, router);
		return;
	}
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);
