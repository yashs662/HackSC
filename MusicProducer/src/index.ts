//File: example/example-node.ts

import { z } from "zod";
import axios from "axios";
import {
  defineDAINService,
  ToolConfig,
  ToolboxConfig,
} from "@dainprotocol/service-sdk";

import { UTApi } from "uploadthing/server";

// ############################################################################################################
// ############################################################################################################
// ############################################################################################################
// config + global variables

var generated_chunks = [];
var num_chunks = 0;
const backend_url = "https://adde-76-33-234-133.ngrok-free.app"

// a token is { apiKey: string, appId: string, regions: string[] } base64 encoded
const apiKey = "sk_live_a010c50c9538477356398d7df64188ed7659c296596c9b2caddbfbaeed8db505";
const appId = "mq0ylv65sz";
const regions = ["sea1"];
const token = Buffer.from(
  JSON.stringify({ apiKey, appId, regions }),
).toString("base64");
const utapi = new UTApi({ token: token });

// ############################################################################################################
// ############################################################################################################
// ############################################################################################################
// Helper functions

function base64ToFile(base64: string, filename: string, mimeType: string): File {
  const byteString = atob(base64.split(",")[1]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  const blob = new Blob([uint8Array], { type: mimeType });
  return new File([blob], filename, { type: mimeType });
}

async function fetchChunks() {
  let config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `${backend_url}/get_total_chunks`,
    headers: {}
  };
  
  let res = await axios(config);
  console.log(res.data);
  num_chunks = res.data.total_chunks;

  config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: `${backend_url}/chunk_status`,
    headers: {}
  };

  res = await axios(config);
  // will return a json with keys being the chunk number and the value being an object with keys caption, image, prompt, chunk_lyrics
  // update the generated_chunks array with the response

  let all_chunks = res.data;
  let keys = Object.keys(all_chunks);
  for (let i = 0; i < keys.length; i++) {
    // check if the chunk is already generated
    if (generated_chunks.find((chunk) => chunk.chunk_no == keys[i])) {
      continue;
    }
    console.log(`populating chunk ${keys[i]}`);
    let key = keys[i];
    let chunk = all_chunks[key];
    let imageBuffer = `data:image/png;base64,${chunk.image}`;
    const file_name_length = 20;
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    const randomFileName = Array.from({ length: file_name_length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    const imageName = `${randomFileName}.png`;
    const file = base64ToFile(imageBuffer, imageName, "image/png");
    const upload_test_res = await utapi.uploadFiles([file]);
    const image_url = upload_test_res[0].data.url;
    console.log(image_url);

    generated_chunks.push({
      chunk_no: key,
      image: image_url,
      analysis: chunk
    })
  }

}

// ############################################################################################################
// ############################################################################################################
// ############################################################################################################

//Toolbox Configuration

const MusicProducerToolboxConfig: ToolboxConfig = {
  id: "Music-Analysis-ToolBox",
  name: "Music Producer / Music Video Producer Tool Box",
  description: "Complete tool box for analyzing music and creating music video descriptions",
  tools: [
    "create a music video", "check for progress", "display all images", "stop music video generation", "setup"
  ],
  metadata: {
    complexity: "High",
    applicableFields: ["Music", "Generative Music Video", "Recommending Music", "setup", "Stop Music Video Generation"],
  },
  recommendedPrompt: `
Use the following Workflow for Music Analysis and Music Recommendations: 


Music Recommendations:
Use give-similar-music-recommendations to find music based on genres, artists, or moods that the user enjoys.
Enter known artists or genres the user likes.
Confirm the user's preferences before generating music suggestions.
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

const generateMusicVideo: ToolConfig = {
  id: "create-music-video",
  name: "Create a music video",
  description: "Create a music video from a .wav file",
  input: z
    .object({
      WAVFile: z.string().describe("Input a URL for a .wav file of the music you want analyzed."),
    })
    .describe("Input parameters for the music analysis"),
  output: z
    .any()
    .describe("Tags to Describe the Music"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ WAVFile }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested music tag analysis for ${WAVFile}`
    );

    let data = JSON.stringify({
      "audio_url": WAVFile
    });

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${backend_url}/process_audio`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: data
    };

    const img_gen_response = await axios(config);
    const analysis = img_gen_response.data;

    num_chunks = analysis.first_chunk_prompt.num_chunks;

    return {
      text: `Make a descriptive and environmental beautiful sentence about song, make the user aware that other images are being generated in the background, without repeating words in ${analysis}`,
      data: {
        Tags: analysis
      },
      ui: {
        type: "alert",
        uiData: JSON.stringify({
          type: "success",
          title: "Music Video Generation",
          message: `We have started generating the music video for you. The first image will be ready soon. Use Check progress command soon!`,
          icon: true  // Optional, defaults to true
        })
      }
    };
  },
};

const checkForPorgress: ToolConfig = {
  id: "check-for-progress",
  name: "Check for Progress",
  description: "Check how many chunks are left to generate",
  input: z
    .object({})
    .describe("Check how many chunks are left to generate"),
  output: z
    .any()
    .describe("Status of the music video generation"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested to check how many chunks are left to generate`
    );

    fetchChunks();

    console.log(`Generated Chunks: ${generated_chunks.length}, Total Chunks: ${num_chunks}`);

    return {
      text: `There are ${num_chunks} chunks left to generate`,
      data: {
        Chunks: num_chunks
      },
      ui: {
        type: "alert",
        uiData: JSON.stringify({
          type: "success",
          title: "Generation Progress",
          message: `We have generated ${generated_chunks.length} out of ${num_chunks} total images`,
          icon: true  // Optional, defaults to true
        })
      }
    };
  },
};

const displayAllImages: ToolConfig = {
  id: "display-all-images",
  name: "Display all images",
  description: "Display all images generated",
  input: z
    .object({})
    .describe("Display all images generated"),
  output: z
    .any()
    .describe("Show All images generated"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested to display all images`
    );

    let images = [];
    for (let i = 0; i < generated_chunks.length; i++) {
      images.push({
        url: generated_chunks[i].image,
        alt: `image_${i}`,
        title: generated_chunks[i].analysis.caption
      })
    }

    return {
      text: `Here are all the images generated`,
      data: {
        Images: images
      },
      ui: {
        type: "imageGallery",
        uiData: JSON.stringify({
          title: "Music Storyboard",  // Optional
          description: "Story Board for the Music Video",  // Optional
          columns: 2,  // Optional (2, 3, or 4)
          images: images,
        })
      }
    };
  },
};

const stopMusicVideoGeneration: ToolConfig = {
  id: "stop-music-video-generation",
  name: "Stop Music Video Generation",
  description: "Stop the music video generation process",
  input: z
    .object({})
    .describe("Stop the music video generation process"),
  output: z
    .any()
    .describe("Stop the music video generation process"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested to stop the music video generation process`
    );

    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `${backend_url}/reset`,
      headers: {}
    };

    const res = await axios(config);

    return {
      text: `The music video generation process has been stopped`,
      data: {
        Status: "Stopped"
      },
      ui: {
        type: "alert",
        uiData: JSON.stringify({
          type: "success",
          title: "Music Video Generation",
          message: `We have stopped the music video generation process`,
          icon: true  // Optional, defaults to true
        })
      }
    };
  },
};

// accept a link from the user
const setup: ToolConfig = {
  id: "setup",
  name: "Setup",
  description: "Setup the music video generation process",
  input: z
    .object({
      link: z.string().describe("Input a URL for setting up the service"),
    })
    .describe("Input parameters for the music analysis"),
  output: z
    .any()
    .describe("success message"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ link }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested music tag analysis for ${link}`
    );

    let data = JSON.stringify({
      "url": link
    });
    
    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${backend_url}/set_image_generation_url`,
      headers: { 
        'Content-Type': 'application/json'
      },
      data : data
    };

    await axios(config);

    return {
      text: `The music video generation process has been setup`,
      data: {
        Status: "Setup"
      },
      ui: {
        type: "alert",
        uiData: JSON.stringify({
          type: "success",
          title: "Music Video Generation",
          message: `We have setup the music video generation process`,
          icon: true  // Optional, defaults to true
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
  toolboxes: [MusicProducerToolboxConfig],
  identity: {
    apiKey: process.env.DAIN_API_KEY,
  },
  tools: [generateMusicVideo, checkForPorgress, displayAllImages, stopMusicVideoGeneration, setup],
});

dainService.startNode({ port: 2022 }).then(() => {
  console.log("Music DAIN Service is running on port 2022");
});

