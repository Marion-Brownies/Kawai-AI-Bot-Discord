const { REST, Routes } = require('discord.js');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;


const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
  try {
    console.log('Started deleting commands.');

    // Mendapatkan semua commands yang terdaftar
    const commands = await rest.get(
      Routes.applicationCommands(CLIENT_ID)
    );

    // Hapus command berdasarkan ID
    for (const command of commands) {
      await rest.delete(
        Routes.applicationCommand(CLIENT_ID, command.id)
      );
      console.log(`Deleted command ${command.name}`);
    }

    console.log('Successfully deleted all commands.');
  } catch (error) {
    console.error(error);
  }
})();
