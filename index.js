import { Client, GatewayIntentBits } from 'discord.js';
import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    entersState,
    VoiceConnectionStatus,
    StreamType
} from '@discordjs/voice';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Function to stream local files
function streamFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error('File not found!');
    }
    return fs.createReadStream(filePath);
}

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('!play') || message.author.bot) return;

    const args = message.content.split(' ');
    const fileName = args[1];

    if (!fileName) {
        return message.reply('Please provide a valid file name.');
    }

    // Define path to your music files
    const filePath = path.join('/path/to/your/music/folder', fileName);

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        return message.reply('You need to be in a voice channel!');
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (error) {
        console.error('Connection error:', error);
        return message.reply('Failed to join the voice channel.');
    }

    const audioStream = streamFromFile(filePath);
    const resource = createAudioResource(audioStream, {
        inputType: StreamType.Opus
    });

    const player = createAudioPlayer();
    player.play(resource);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
    });

    player.on('error', (error) => {
        console.error('AudioPlayer error:', error);
        message.reply('There was an error playing that audio.');
        connection.destroy();
    });

    message.reply(`Now playing: ${fileName}`);
});

client.login(process.env.DISCORD_TOKEN);
