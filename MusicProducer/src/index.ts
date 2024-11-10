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
const MusicProducerToolboxConfig: ToolboxConfig = {
  id: "Music-Analysis-ToolBox",
  name: "Music Producer / Music Video Producer Tool Box",
  description: "Complete tool box for analyzing music and creating music video descriptions",
  tools: [
    "give-simular-music-recommendations", "get-music-tags", 
  ],
  metadata: {
    complexity: "High",
    applicableFields: ["Music", "Generative Music Video", "Recommending Music"]
  },
  recommendedPrompt: `
Use the following Workflow for Music Analysis and Musc Recommendations: 


Music Recommendations:
Use give-similar-music-recommendations to find music based on genres, artists, or moods that the user enjoys.
Enter known artists or genres the user likes.
Confirm the user’s preferences before generating music suggestions.
Music Tagging (Audio Analysis):

Use get-music-tags to analyze music from a .wav file.
Request the user to provide a link to the .wav file and the title of the track.
Ensure the file is accessible and verify the track title before proceeding with analysis.
After generating the music tags, review them with the user to confirm the analysis.
Lyrics Analysis:

Use describe-music-from-lyrics to analyze lyrics and generate tags or descriptions of the song’s tone, story, and themes.
Ask the user to provide the lyrics or a snippet from the song.
Generate a brief description or assumption about the tone and story based on the lyrics.
Visual Representation of Music:

Use display-image-for-music to generate an image or visual description based on the music's characteristics.
Request the user to provide a title and, if available, tags or specific prompts for the image.
After image generation, review the output with the user to confirm the visual aligns with the music theme.
Final Steps:

Review all generated content with the user (music recommendations, tags, visual descriptions).
Make any adjustments based on user feedback.
Deliver the final outputs, ensuring the user is satisfied with all aspects of the music analysis and creative visuals
    
  `
};

//Display Images //Give Link to Images
const giveMusicRecommendations: ToolConfig = {
  id: "give-simular-music-recommendations",
  name: "give me music recommendations",
  description: "Gives music recommendations of genres, artists, and moods simular ones previously mentioned",
  input: z
    .object({
      user_known_artists: z.string().describe("Enter music artists or genres you enjoy to listen to.")
    })
    .describe("Input parameters for the music analysis"),
  output: z
    .any()
    .describe("Tags to Describe the Music"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ user_known_artists }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested music recommendations`
    );
    // Local AI prompting goes here
    //const tags = "High Tempo, C# key, Low Energy, Choir Music, Harsh Tones "


    //const tags = "Bees, Hive Music, Silly, Whimsical";
  //for the first time period the music is {tempo, key, energy, type of song, timbre}
    return {
      text: `Return Music artists simular in genre and theme to ${user_known_artists}`,
      data: { },
      ui: {  }
    };
  },
};
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
   const analysis = "Prompt for segment 180.0-190.0s:,Tempo: moderately paced, relaxed - 86.1328125 BPM, Key F - bright and uplifting overtones. Energy energy 0.3415415585041046 - steady, balanced rhythms vibe. The timbre is spectral centroid 2457.8464735763346 - warm and balanced spectral rolloff 5137.135194562899 - with high, piercing frequencies spectral bandwith 3214.8297814488824 - with a rough, textured feel.Lyrics: I said, ooh, I'm blinded by the light"

    //const tags = "Bees, Hive Music, Silly, Whimsical";
  //for the first time period the music is {tempo, key, energy, type of song, timbre}
    return {
      text: `Make a descriptive and enviromental beatufiul sentance about song, ${Title}, without repeating words in ${analysis}`,
      data: {
        Tags : analysis
      },
      ui: {
        type: "card",
        uiData: JSON.stringify({
          title: "Tags",
          content: analysis
        })
      }
    };
  },
};
const describeMusicFromLyrics: ToolConfig = {
  id: "describe-music-from-lyrics",
  name: "Describe this music from the lyrics",
  description: "Describe the lyrics of the music to genres, emotions, places, and themes",
  input: z
    .object({
      Lyrics: z.string().describe("Enter the Lyrics from the song you want analyzed.")
    })
    .describe("Input parameters for the music analysis"),
  output: z
    .any()
    .describe("Tags to Describe the Music"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ Lyrics }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested lyrical analysis.`
    );
    // Local AI prompting goes here (if needed)
    // const lyric = "High Tempo, C# key, Low Energy, Choir Music, Harsh Tones "
    
    //const tags = "Bees, Hive Music, Silly, Whimsical";
  //for the first time period the music is {tempo, key, energy, type of song, timbre}
    return {
      text: `From the following Lyrics "${Lyrics}" make an assumption of the tone and story of the song. Keep the description brief (less than 25 words) and accurate. Make sure the descriptio reflects the language spoken`,
      data: {
      },
      ui: {
        }
      };
  }
};
const displayImageForMusicFile: ToolConfig = {
  id: "display-image-for-music",
  name: "show an image describing this music file",
  description: "Create an image for this music using the tags produced by its title and the WAV file",
  input: z
    .object({
      //WAVFile : z.string().describe("Input a URL for a .wav file of the music you want analyzed."),
      Title: z.string().describe("Enter the title of the music piece (this may be different than that of the .wav file)."),
      //Tags : z.string().describe("Words seperated by commas to describe musics when combined.")
    })
    .describe("Input parameters for Image generation"),
  output: z
    .any()
    .describe("Create Tags to Describe the Music"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ WAVFile, Title, Tags, Prompt }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested image generation for ${WAVFile} and ${Title} using ${Tags}`
    );
    // Local AI prompting goes here
    const tags = "high tempo, in the c# key, somber energy, choir song, and harsh}";
  
    return {
        text: "Generated image card",
        data: { /* your data */ },
        ui: {
          type: "imageCard",
          uiData: JSON.stringify({
            title: Title ?? Prompt ?? "Image Generated From Song Description",
            description: "Beautiful mountain vista at sunset",
            imageUrl: "https://example.com/mountain.jpg",
            imageAlt: "Mountain sunset",
            aspectRatio: "video",
            actions: [
              {
                text: "View Full Size",
                url: "https://example.com/mountain-full.jpg",
                variant: "default"
              }
            ],
            overlay: false
          })
        }
      }
  }
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
  toolboxes: [MusicProducerToolboxConfig],
  identity: {
    apiKey: process.env.DAIN_API_KEY,
  },
  tools: [getMusicTagsFromWav,displayImageForMusicFile, giveMusicRecommendations, describeMusicFromLyrics],
});

dainService.startNode({ port: 2022 }).then(() => {
  console.log("Music DAIN Service is running on port 2022");
});

