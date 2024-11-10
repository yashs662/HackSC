//File: example/example-node.ts

import { z } from "zod";
import axios from "axios";

import {
  defineDAINService,
  ToolConfig,
  ServiceConfig,
  ToolboxConfig,
  ServiceContext,
} from "@dainprotocol/service-sdk";

const getMusicTagsFromWav: ToolConfig = {
  id: "get-music-tags",
  name: "Describe this music",
  description: "Describe and tags the music to genres, emotions, places, and themes",
  input: z
    .object({
      WAVFile : z.string().describe("Input a URL for a .wav file of the music you want analyzed."),
      Title: z.string().describe("Enter the title of the music piece (this may be different than that of the .wav file).")
    })
    .describe("Input parameters for the music analysis"),
  output: z
    .any()
    .describe("Tags to Describe the Music"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ WAVFile, Title }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested music tag analsysis for ${WAVFile} and ${Title}`
    );
    // Local AI prompting goes here
    const tags = "Bees, Hive Music, Silly, Whimsical";
  
    return {
      text: `Successfully Processed file ${WAVFile} titled ${Title}`,
      data: {
        Tags : tags
      },
      ui: {
        type: "card",
        uiData: JSON.stringify({
          title: "Tags",
          content: tags
        })
      }
    };
  },
};

const dainService = defineDAINService({
  metadata: {
    title: "Music Analysis",
    description:
      "Friend-Shaped Music Analyst",
    version: "1.0.0",
    author: "HackSC",
    tags: ["Music Creation", "Music", "HackSC"],
    logo: "https://cdn-icons-png.flaticon.com/512/252/252035.png"
  },
  identity: {
    apiKey: process.env.DAIN_API_KEY,
  },
  tools: [getMusicTagsFromWav],
});

dainService.startNode({ port: 2022 }).then(() => {
  console.log("Music DAIN Service is running on port 2022");
});
