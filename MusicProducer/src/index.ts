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
const backend_url = "https://95d5-76-33-234-133.ngrok-free.app"

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
    "create a music video", "check for progress", "display current progress", "stop music video generation", "setup", "brainstorming", "get question from category"
  ],
  metadata: {
    complexity: "High",
    applicableFields: ["Music", "Generative Music Video", "Recommending Music", "setup", "Stop Music Video Generation", "Brainstorming", "Get Question from Category"],
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

    num_chunks = analysis.num_chunks;

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

    await fetchChunks();

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

const displayCurrentProgress: ToolConfig = {
  id: "display-current-progress",
  name: "Display Current Progress",
  description: "Display current progress of the music video generation",
  input: z
    .object({})
    .describe("Display all images generated till now"),
  output: z
    .any()
    .describe("Show all images generated till now"),
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
        // title: generated_chunks[i].analysis.caption
      })
    }

    return {
      text: `Okay`,
      data: {},
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
      method: 'post',
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

//brainstorming tools
const BrainstormingQuestions = [
  "What emotions or moods do we want the music to evoke in the listener?",
  "What musical genres or styles best reflect the message of the song?",
  "Should the song include any unconventional instruments or sounds to create a unique vibe?",
  "What tempo or rhythm would best complement the theme of the song?",
  "How can the song’s structure (verse, chorus, bridge) enhance its emotional impact?",
  "Do we want to incorporate any vocal harmonies, or should the focus be on a single lead vocal?", ,
  "Should the music feature any experimental or unconventional production techniques?",
  "What is the role of silence or space within the track—how can we use it creatively?",
  "How can we use dynamics (soft vs. loud) to build tension or release in the song?",
  "Are there any specific cultural or historical musical influences that we want to incorporate?",
  "How can the visual aesthetic of the music video reflect the song’s themes or lyrics?",
  "What colors, textures, or lighting would best suit the mood of the music and enhance the atmosphere?",
  "Should the video tell a linear story, or should it focus on abstract imagery and symbolism?",
  "How can the visuals be aligned with the rhythm or structure of the music to create a stronger connection?",
  "What type of setting (urban, nature, surreal, futuristic, etc.) would best fit the song’s tone?",
  "How can we incorporate special effects, animation, or digital art to add another layer to the video?",
  "Should we include any recurring motifs or visual themes throughout the video to create a sense of continuity?",
  "How can the artist’s performance be captured in a way that resonates with the song’s emotions and message?",
  "What role should dancers, actors, or extras play in the video—will they contribute to the narrative or emphasize the song’s mood?",
  "How can we use camera angles, framing, and movement to enhance the feeling and energy of the music?",
  "What is the song’s main message or story? What emotion or experience do you want to convey?",
  "Who is this song for? How do you want listeners to feel or react?",
  "How can you incorporate personal experiences or emotions to create a unique, genuine piece?",
  "Does the melody complement the song's theme? How memorable or catchy is it?",
  "How do the chords and harmonies build or release tension? Do they support the emotional tone?",
  "How fast or slow is the piece, and how does that affect the mood? What type of beat pattern will drive the song?",
  "Are there any genres or artists inspiring this piece? What elements can you adopt while still keeping it unique?",
  "What instruments or sounds suit the song's mood and message? Are there any unconventional sounds or textures to explore?",
  "How polished, raw, or experimental should the production be? What effect do you want the production style to have on listeners?",
  "Should the lyrics be poetic, straightforward, or abstract? What tone best supports the story?",
  "Are there specific images or metaphors that enhance the story? Can they make the song more relatable or impactful?",
  "How will the verses, chorus, bridge, and hook work together to tell the story effectively?",
  "What effects or soundscapes will enhance the mood? Consider reverb, delay, or filters for atmosphere.",
  "How can you use dynamics to emphasize emotional peaks? Where should the music be soft or intense?",
  "How can you add contrast to make certain parts of the song stand out? Think about building up or breaking down sections.",
  "How will you ensure clear, high-quality recordings of vocals and instruments?",
  "How will you balance different elements, and what tools will help finalize the sound for clarity and consistency?",
  "Are there too many or too few layers in the song? Does the arrangement flow well and maintain listener interest?",
  "How will the song reach its intended audience? Will it be released on streaming platforms, social media, or live performances?",
  "What visuals, album art, or music video concepts could enhance the song’s impact?",
  "Is this song part of a larger project, like an album? How does it fit into your broader musical identity?"
];
const SongwritingQuestions = {
  "Story and Audience": [
    "What is the song's main message or story? What emotion or experience do you want to convey?",
    "Who is this song for? How do you want listeners to feel or react?",
    "How can you incorporate personal experiences or emotions to create a unique, genuine piece?"
  ],
  "Musical Composition": [
    "Does the melody complement the song's theme? How memorable or catchy is it?",
    "How do the chords and harmonies build or release tension? Do they support the emotional tone?",
    "How fast or slow is the piece, and how does that affect the mood? What type of beat pattern will drive the song?"
  ],
  "Genre and Style": [
    "Are there any genres or artists inspiring this piece? What elements can you adopt while still keeping it unique?",
    "What instruments or sounds suit the song's mood and message? Are there any unconventional sounds or textures to explore?",
    "How polished, raw, or experimental should the production be? What effect do you want the production style to have on listeners?"
  ],
  "Lyrics and Storytelling": [
    "Should the lyrics be poetic, straightforward, or abstract? What tone best supports the story?",
    "Are there specific images or metaphors that enhance the story? Can they make the song more relatable or impactful?",
    "How will the verses, chorus, bridge, and hook work together to tell the story effectively?"
  ],
  "Mood and Atmosphere": [
    "How can we use camera angles, framing, and movement to enhance the feeling and energy of the music?",
    "What effects or soundscapes will enhance the mood? Consider reverb, delay, or filters for atmosphere.",
    "How can you use dynamics to emphasize emotional peaks? Where should the music be soft or intense?",
    "How can you add contrast to make certain parts of the song stand out? Think about building up or breaking down sections."
  ],
  "Technical Execution": [
    "How will you ensure clear, high-quality recordings of vocals and instruments?",
    "How will you balance different elements, and what tools will help finalize the sound for clarity and consistency?",
    "Are there too many or too few layers in the song? Does the arrangement flow well and maintain listener interest?"
  ],
  "Market and Vision": [
    "How will the song reach its intended audience? Will it be released on streaming platforms, social media, or live performances?",
    "What visuals, album art, or music video concepts could enhance the song's impact?",
    "Is this song part of a larger project, like an album? How does it fit into your broader musical identity?"
  ]
};
const getQuestionFromCategory: ToolConfig = {
  id: "get-category-questions",
  name: "provide questions about music making in a specific topic",
  description: "Provides questions from a specific songwriting category to guide the creative process",
  input: z.object({
    category: z.enum(Object.keys(SongwritingQuestions) as [string, ...string[]]).describe("The songwriting category to get questions from")
  }),
  output: z.object({
    questions: z.array(z.string()).describe("List of questions from the selected category")
  }),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ category }, agentInfo) => {
    const questions = SongwritingQuestions[category];

    return {
      text: `Selected ${questions.length} questions from the "${category}" category`,
      data: { questions },
      ui: {
        type: "card",
        uiData: JSON.stringify({
          title: `Songwriting Questions: ${category}`,
          content: "Consider these questions as you work on your song:"
        })
      }
    }
  }
};

const getBrainstorming: ToolConfig = {
  id: "Brain-Storm-about-Music",
  name: "help Brainstorm ideas about Music and Music Videos",
  description: "Get ideas and answer questions to kick-star your creative process",
  input: z.object({}),
  output: z.object({
    question: z.string().describe("Randomly selected brainstorming question")
  }),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async (_, agentInfo) => {
    const randomIndex = Math.floor(Math.random() * BrainstormingQuestions.length);
    const selectedQuestion = BrainstormingQuestions[randomIndex];

    return {
      text: `Selected question: ${selectedQuestion}. Think about how this relates to the music or the music video you are creating.`,
      data: { question: selectedQuestion },
      ui: {
        type: "card",
        uiData: JSON.stringify({
          title: "Brainstorming Question",
          content: selectedQuestion
        }),
        children: [
          {
            type: "alert",
            uiData: JSON.stringify({
              type: "info",
              title: "Tip",
              message: "Take a moment to think creatively. There are no wrong answers in brainstorming!"
            })
          },
          {
            type: "progressList",
            uiData: JSON.stringify({
              title: "Brainstorming Progress",
              items: [
                {
                  label: "Questions Explored",
                  value: 1,
                  max: 10,
                  color: "bg-blue-600",
                  description: "Keep going to explore more questions!"
                }
              ]
            })
          }
        ]
      }
    };
  }
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
      data: data
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
  tools: [generateMusicVideo, checkForPorgress, displayCurrentProgress, stopMusicVideoGeneration, setup, getBrainstorming, getQuestionFromCategory],
});

dainService.startNode({ port: 2022 }).then(() => {
  console.log("Music DAIN Service is running on port 2022");
});

