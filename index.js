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
import https from 'https';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Variable to store the current song being played
let currentSong = null; // { fileName: 'song.mp3', name: 'Great Song' }

// Store uploaded files and their names in memory
let songList = []; // [{ fileName: 'song.mp3', name: 'Great Song' }]

// Path to your music folder
const musicFolderPath = '/root/music-player/music';

// Populate the song list on startup
function populateSongList() {
    fs.readdir(musicFolderPath, (err, files) => {
        if (err) {
            console.error('Error reading music folder:', err);
            return;
        }

        // Only keep audio files (you can adjust this to other file types as needed)
        // songList = files.filter(file => file.endsWith('.mp3') || file.endsWith('.flac')).map(file => ({
        songList = files.map(file => ({
            fileName: file,
            name: file // Initially, the user-provided name is the file name
        }));

        console.log(`Loaded songs: ${songList.map(song => song.name).join(', ')}`);
    });
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    populateSongList();  // Load the songs on startup
});

// Function to download the song and save it locally
function downloadFile(url, fileName) {
    const saveDirectory = musicFolderPath;
    const filePath = path.join(saveDirectory, fileName);

    https.get(url, (response) => {
        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
            console.log(`Downloaded: ${fileName}`);
            // After the download, add it to the song list
            songList.push({ fileName, name: fileName });
        });

        fileStream.on('error', (error) => {
            console.error('Error downloading the file:', error);
        });
    }).on('error', (error) => {
        console.error('Error with the HTTP request:', error);
    });
}

// Function to stream local files
function streamFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error('File not found!');
    }
    return fs.createReadStream(filePath);
}

// Handle the !upload command to upload and save files
client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!upload') && !message.author.bot) {
        const args = message.content.split('!upload');
        const fileName = args[1].trim();

        if (!fileName) {
            return message.reply('Please provide a valid file name (e.g., !upload mysong.mp3).');
        }

        // Check if the message has an attachment
        if (message.attachments.size === 0) {
            return message.reply('Please attach an audio file to upload.');
        }

        const attachment = message.attachments.first();

        // Check if the file is an audio file
        if (!attachment.contentType || !attachment.contentType.startsWith('audio')) {
            return message.reply('The attached file is not an audio file. Please upload a valid audio file.');
        }

        // Download the file
        downloadFile(attachment.url, fileName);
        message.reply(`Successfully uploaded and saved your file: ${fileName}`);
    }

    // Handle the !name command to store the current song with a name
    if (message.content.startsWith('!name') && !message.author.bot) {
        const args = message.content.split('!name');
        const songName = args[1].trim();

        if (!songName || !currentSong) {
            return message.reply('No song is currently playing to name.');
        }

        // Check if the song name already exists in the cache
        const nameExists = songList.some(song => song.name.toLowerCase() === songName.toLowerCase());

        if (nameExists) {
            return message.reply('A song with that name already exists.');
        }

        currentSong.name = songName;  // Update the name of the current song
        songList.push({ fileName: currentSong.fileName, name: songName });  // Add to song list
        message.reply(`Song has been named: ${songName}`);
    }

    // Handle the !play command to play the uploaded song by file name or song name
    if (message.content.startsWith('!play') && !message.author.bot) {
        const args = message.content.split('!play');
        let fileName = args[1].trim();

        if (!fileName) {
            return message.reply('Please provide a valid file name or song name.');
        }

        // Check if it's the user-given name or file name
        let song = songList.find(s => s.name === fileName || s.fileName === fileName);

        if (!song) {
            return message.reply('Song not found.');
        }

        // Get the file path of the song
        const filePath = path.join(musicFolderPath, song.fileName);

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

        try {
            const audioStream = streamFromFile(filePath);
            const resource = createAudioResource(audioStream, {
                inputType: StreamType.Arbitrary  // Use Arbitrary if the file is not Opus
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

            currentSong = { fileName: song.fileName, name: song.name };  // Update current song
            message.reply(`Now playing: ${song.name || song.fileName}`);
        } catch (error) {
            console.error('File reading error:', error);
            message.reply('There was an error reading the audio file.');
        }
    }

    // Handle the !list command to list all cached songs
    if (message.content === '!list') {
        const songListNames = songList.map(s => s.name || s.fileName).join(', ');
        if (songListNames) {
            message.reply(`Current songs in cache: ${songListNames}`);
        } else {
            message.reply('No songs are cached.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
