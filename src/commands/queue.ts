"use strict"

import * as _     from 'lodash';
import * as Utils from '../libs/common/Utils';

import { BotConfig, Daos } from '../typings';
import { SoundCloudUsers } from '../models/SoundCloudUsers';
import { DiscordBot }      from '../libs/DiscordBot';
import { YoutubeAPI }      from '../libs/api/YoutubeAPI';
import { SoundCloudAPI }   from '../libs/api/SoundCloudAPI';
import { Message, TextChannel } from 'discord.js';

enum InsertionMode {
  Add,
  Replace,
}

export function addQueueCommands(bot: DiscordBot, config: BotConfig, daos: Daos) {
  const queuePlayerManager = daos.queuePlayerManager;
  const scUsers = daos.soundCloudUsers;
  const users = daos.users;
  const ytApi = new YoutubeAPI(config.tokens.youtube);
  const scApi = new SoundCloudAPI(config.tokens.soundcloud);

  const insertToQueue = async (mode: InsertionMode, message: Message, params: string[]) => {
    try {
      if (params.length === 0) return await message.reply("You didn't specify what to add!");
      const queryResults = await Utils.songQuery(message, params.join(' '), scUsers, users, scApi, ytApi);
      if (_.isNil(queryResults)) return;
      let addedMsg: string;
      switch (mode) {
        case InsertionMode.Add:
          await queuePlayerManager.get(message.guild.id).enqueue(queryResults.songs, queryResults.nextFlag);
          const nameOrLength = queryResults.songs.length > 1 ? `${queryResults.songs.length} songs` : `**${queryResults.songs[0].title}**`;
          addedMsg = `Successfully added ${nameOrLength} `;
          addedMsg += queryResults.nextFlag ? 'to be played next!' : 'to the queue!';
          break;
        case InsertionMode.Replace:
          const queuePlayer = queuePlayerManager.get(message.guild.id);
          if (queuePlayer.queuedTracks !== 0) {
            await queuePlayer.clear();
          }
          await queuePlayer.enqueue(queryResults.songs, queryResults.nextFlag);
          let replaceWith: string;
          if (queryResults.songs.length > 1) {
            replaceWith = `${queryResults.playlists.join(", ")} (${queryResults.songs.length} songs)`;
          } else {
            replaceWith = `**${queryResults.songs[0].title}**`;
          }
          addedMsg = `Successfully replaced queue with ${replaceWith}!`;
          break;
      }
      
      await message.reply(addedMsg);
    } catch (e) {
      await message.reply(`Failed to add anything to the queue.`);
      console.log(e);
    }
  }

  const commands: { [x: string]: (message: Message, params: string[], level: number) => any } = {

    'show': async (message: Message) => {
      const resp = await queuePlayerManager.get(message.guild.id).show(message);
      if (resp) await message.reply(resp);
    },

    'clear': async (message: Message) => {
      const queuePlayer = queuePlayerManager.get(message.guild.id);
      if (queuePlayer.queuedTracks === 0) return await message.reply('The queue is already empty though...');
      await queuePlayer.clear();
      await message.reply('I have cleared the queue');
    },

    'shuffle': async (message: Message) => {
      const resp = await queuePlayerManager.get(message.guild.id).shuffle();
      await message.reply(resp ? resp : 'Successfully shuffled the queue');
    },

    'add': async (message: Message, params: string[]) => {
      insertToQueue(InsertionMode.Add, message, params)
    },

    'replace': async (message: Message, params: string[]) => {
      insertToQueue(InsertionMode.Replace, message, params)
    },
  }

  bot.on(config.commands.find(cat => cat.name === 'Queue').prefix, (command: string, message: Message, params: string[], level: number) => {
    const player = queuePlayerManager.get(message.guild.id);
    if (player.channel && player.channel.id !== message.channel.id)
      return message.reply(`My music channel has been locked in for \`#${player.channel.name}\`. Try again over there!`);
    commands[command](message, params, level);
  });
}
