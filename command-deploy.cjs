require('dotenv').config(); // Tambahkan ini di bagian paling atas

const { REST, Routes } = require('discord.js');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// Tambahkan log untuk memverifikasi
console.log('Bot token:', BOT_TOKEN);
console.log('Client ID:', CLIENT_ID);

const commands = [
    {
      name: 'ask',
      description: 'Ask a question to the bot powered by Google Generative AI',
      options: [
        {
          name: 'question',
          type: 3, // 3 adalah tipe 'STRING'
          description: 'The question you want to ask the bot',
          required: true,
        }
    ]
  },
  {
    name: 'profile',
    description: 'Check a user\'s Discord profile information',
    options: [
      {
        name: 'user',
        description: 'The user you want to check',
        type: 6, // USER type
        required: false // Optional, jika tidak diisi akan mengambil user yang menjalankan command
      }
    ]
  },
  {
    name: 'play',
    description: 'Play a song from SoundCloud',
    options: [
        {
            name: 'song',
            type: 3, // STRING type
            description: 'The song or link you want to play',
            required: true,
        }
    ],
},
{
    name: 'skip',
    description: 'Skip the current song',
},
{
    name: 'leave',
    description: 'leave the voice channel',
},
{
    name: 'queue',
    description: 'Show the current song queue',
}
];

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(CLIENT_ID), // Mendaftarkan secara global
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands globally.');
  } catch (error) {
    console.error(error);
  }
})();
