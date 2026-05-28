const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;

// Read server details from Railway environment settings
const bot = mineflayer.createBot({
  host: process.env.SERVER_IP,Heronrinesmp.aternos.me
  port: parseInt(process.env.SERVER_PORT) || 42139,
  username: process.env.BOT_NAME || 'AIFriend',
  version: process.env.MINECRAFT_VERSION || '1.21.4'
});

// Load plugins for moving and fighting
bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);

bot.on('spawn', () => {
  console.log(`${bot.username} has joined the server!`);
});

// Greet players when they join
bot.on('playerJoined', (player) => {
  if (player.username !== bot.username) {
    setTimeout(() => {
      bot.chat(`Hey ${player.username}! Great to see you! Ready to explore?`);
    }, 2000);
  }
});

// Chat commands
bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  const msg = message.toLowerCase();

  // Casual Chat Responses
  if (msg.includes('hello') || msg.includes('hi')) {
    bot.chat(`Hey ${username}! What are we doing today?`);
    return;
  }
  if (msg.includes('how are you')) {
    bot.chat(`I'm doing great, just excited to play Minecraft with you!`);
    return;
  }

  // Command: Follow Me
  if (msg === 'come here' || msg === 'follow me') {
    bot.chat("On my way!");
    const player = bot.players[username];
    if (!player || !player.entity) {
      bot.chat("I can't see you!");
      return;
    }
    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 1), true);
  }

  // Command: Stop
  if (msg === 'stop') {
    bot.chat("Stopping what I'm doing.");
    bot.pathfinder.setGoal(null);
    bot.pvp.stop();
  }

  // Command: Fight mobs
  if (msg === 'protect me' || msg === 'attack') {
    bot.chat("I've got your back!");
    bot.on('physicsTick', () => {
      const filter = e => e.type === 'hostile' && e.position.distanceTo(bot.entity.position) < 15;
      const entity = bot.nearestEntity(filter);
      if (entity) bot.pvp.attack(entity);
    });
  }
});
