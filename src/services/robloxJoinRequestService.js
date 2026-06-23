import { logger } from '../utils/logger.js';
import axios from 'axios';

const ROBLOX_API_BASE = 'https://apis.roblox.com';
const ROBLOX_WEB_BASE = 'https://www.roblox.com';

class RobloxJoinRequestHandler {
  constructor() {
    this.username = process.env.ROBLOX_USERNAME;
    this.password = process.env.ROBLOX_PASSWORD;
    this.cookie = null;
    this.lastAuthTime = 0;
    this.authCooldown = 3600000; // 1 hour
  }

  async authenticate() {
    try {
      // Check if we need to re-authenticate
      if (this.cookie && Date.now() - this.lastAuthTime < this.authCooldown) {
        return true;
      }

      if (!this.username || !this.password) {
        logger.error('Roblox credentials not configured');
        return false;
      }

      const response = await axios.post(
        `${ROBLOX_WEB_BASE}/login/v1/login`,
        {
          ctype: 'Username',
          cvalue: this.username,
          password: this.password
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          withCredentials: true
        }
      );

      if (response.data.user) {
        // Extract cookies from response
        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader) {
          this.cookie = setCookieHeader.join('; ');
          this.lastAuthTime = Date.now();
          logger.info('Successfully authenticated with Roblox');
          return true;
        }
      }

      logger.error('Failed to authenticate with Roblox: No user data');
      return false;
    } catch (error) {
      logger.error('Roblox authentication error:', error.message);
      return false;
    }
  }

  async getGroupJoinRequests(groupId) {
    try {
      if (!await this.authenticate()) {
        return [];
      }

      const response = await axios.get(
        `${ROBLOX_API_BASE}/v1/groups/${groupId}/join-requests`,
        {
          headers: {
            'Cookie': this.cookie,
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );

      return response.data.data || [];
    } catch (error) {
      logger.error(`Error fetching join requests for group ${groupId}:`, error.message);
      return [];
    }
  }

  async getUserInfo(userId) {
    try {
      const response = await axios.get(
        `${ROBLOX_API_BASE}/v1/users/${userId}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Error fetching user info for ${userId}:`, error.message);
      return null;
    }
  }

  async getUserDetails(userId) {
    try {
      const response = await axios.get(
        `${ROBLOX_WEB_BASE}/users/profile/profile-data?userId=${userId}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Error fetching user details for ${userId}:`, error.message);
      return null;
    }
  }

  async acceptJoinRequest(groupId, userId) {
    try {
      if (!await this.authenticate()) {
        return false;
      }

      const response = await axios.post(
        `${ROBLOX_API_BASE}/v1/groups/${groupId}/join-requests/users/${userId}/accept`,
        {},
        {
          headers: {
            'Cookie': this.cookie,
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );

      logger.info(`Accepted join request for user ${userId} in group ${groupId}`);
      return true;
    } catch (error) {
      logger.error(`Error accepting join request for user ${userId}:`, error.message);
      return false;
    }
  }

  async denyJoinRequest(groupId, userId) {
    try {
      if (!await this.authenticate()) {
        return false;
      }

      const response = await axios.post(
        `${ROBLOX_API_BASE}/v1/groups/${groupId}/join-requests/users/${userId}/decline`,
        {},
        {
          headers: {
            'Cookie': this.cookie,
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );

      logger.info(`Denied join request for user ${userId} in group ${groupId}`);
      return true;
    } catch (error) {
      logger.error(`Error denying join request for user ${userId}:`, error.message);
      return false;
    }
  }
}

export const robloxHandler = new RobloxJoinRequestHandler();

export async function checkRobloxJoinRequests(client) {
  try {
    const groupConfigs = [
      {
        groupId: process.env.ROBLOX_TEST_GROUP_ID,
        channelEnvVar: 'ROBLOX_REQUESTS_CHANNEL_TEST',
        name: 'Test Group'
      },
      {
        groupId: process.env.ROBLOX_LASD_GROUP_ID,
        channelEnvVar: 'ROBLOX_REQUESTS_CHANNEL_LASD',
        name: 'LASD'
      },
      {
        groupId: process.env.ROBLOX_CHP_GROUP_ID,
        channelEnvVar: 'ROBLOX_REQUESTS_CHANNEL_CHP',
        name: 'CHP'
      },
      {
        groupId: process.env.ROBLOX_LAFD_GROUP_ID,
        channelEnvVar: 'ROBLOX_REQUESTS_CHANNEL_LAFD',
        name: 'LAFD'
      }
    ];

    for (const config of groupConfigs) {
      if (!config.groupId) continue;

      const channelId = process.env[config.channelEnvVar];
      if (!channelId) {
        logger.warn(`No Discord channel configured for ${config.name} (${config.channelEnvVar})`);
        continue;
      }

      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
          logger.warn(`Channel ${channelId} not found for ${config.name}`);
          continue;
        }

        const requests = await robloxHandler.getGroupJoinRequests(config.groupId);

        for (const request of requests) {
          const userId = request.requester.userId;
          const userInfo = await robloxHandler.getUserInfo(userId);
          const userDetails = await robloxHandler.getUserDetails(userId);

          if (!userInfo) continue;

          // Create embed with user info
          const embed = {
            title: `🎮 Join Request - ${config.name}`,
            color: 0x1a1a1a,
            fields: [
              {
                name: 'Username & Display',
                value: `${userInfo.name} (${userInfo.displayName})`,
                inline: false
              },
              {
                name: 'User ID',
                value: `${userId}`,
                inline: true
              },
              {
                name: 'About',
                value: userDetails?.aboutMe || 'No bio',
                inline: false
              },
              {
                name: 'Total Groups',
                value: `${userDetails?.groupCount || 0}`,
                inline: true
              },
              {
                name: 'Account Created',
                value: userInfo.created ? new Date(userInfo.created).toLocaleDateString() : 'Unknown',
                inline: true
              }
            ],
            footer: {
              text: `User ID: ${userId}`
            },
            timestamp: new Date()
          };

          // Send message with buttons
          const message = await channel.send({
            embeds: [embed],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 3, // Green
                    label: 'Accept',
                    custom_id: `roblox_accept_${config.groupId}_${userId}`,
                    emoji: '✅'
                  },
                  {
                    type: 2,
                    style: 4, // Red
                    label: 'Deny',
                    custom_id: `roblox_deny_${config.groupId}_${userId}`,
                    emoji: '❌'
                  }
                ]
              }
            ]
          });

          logger.info(`Posted join request for user ${userId} in ${config.name}`);
        }
      } catch (error) {
        logger.error(`Error checking join requests for ${config.name}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Error in checkRobloxJoinRequests:', error.message);
  }
}

