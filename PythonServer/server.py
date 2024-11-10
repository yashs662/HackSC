from flask import Flask, request, jsonify
from pyngrok import ngrok
import requests
import os
import librosa
import numpy as np
import soundfile as sf
from transformers import pipeline
from concurrent.futures import ThreadPoolExecutor
import threading
import time

app = Flask(__name__)
NUM_WORKERS = 1
executor = ThreadPoolExecutor(max_workers=NUM_WORKERS)
lock = threading.Lock()
chunk_status = {}
image_generation_url = ""
SEGMENT_DURATION = 20  # seconds
total_chunks = 0


# Function to download the audio file from the provided URL
def download_audio(url, filename):
    response = requests.get(url)
    with open(filename, "wb") as file:
        file.write(response.content)


# Function to extract tempo and beats from audio
def extract_tempo_and_beats(audio_path):
    y, sr = librosa.load(audio_path)

    # Extract tempo
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)

    # Extract beat frames
    beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)[1]
    beats = librosa.frames_to_time(beat_frames, sr=sr)

    return tempo, beats


# Function to extract the musical key
def extract_key(audio_path, segment_start, segment_end):
    y, sr = librosa.load(
        audio_path, sr=None, offset=segment_start, duration=segment_end - segment_start
    )

    # Extract chroma features (key detection)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)

    # Find the pitch class with maximum chroma mean
    key_index = chroma_mean.argmax()
    keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    key = keys[key_index]
    return key


# Function to extract energy for a given time segment
def extract_energy(audio_path, segment_start, segment_end):
    y, sr = librosa.load(
        audio_path, sr=None, offset=segment_start, duration=segment_end - segment_start
    )
    energy = np.sqrt(np.mean(np.square(y)))
    return energy


# Function to extract spectral features for a given segment
def extract_spectral_features(audio_path, segment_start, segment_end):
    y, sr = librosa.load(
        audio_path, sr=None, offset=segment_start, duration=segment_end - segment_start
    )

    # Extract spectral centroid, rolloff, and bandwidth
    spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr).mean()
    spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr).mean()
    spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr).mean()

    return spectral_centroid, spectral_rolloff, spectral_bandwidth


# Function to create a more specific prompt for each segment of the song
def create_prompt(
    lyrics,
    current_segment_lyrics,
    tempo,
    key,
    energy,
    spectral_features,
    num_images,
    current_image_index,
    previous_caption=None,
    user_style=None,
):
    # Analyze song characteristics
    # Tempo
    if tempo < 60:
        tempo_desc = "slow and calming"
    elif 60 <= tempo < 120:
        tempo_desc = "moderately paced, relaxed"
    else:
        tempo_desc = "fast-paced, energetic"

    # Key
    if key in ["C", "D", "E", "F", "G", "A"]:
        key_desc = f"Key {key} - bright and uplifting"
    else:
        key_desc = f"Key {key} - dark and mysterious"

    # Energy
    if energy < 0.1:
        energy_desc = f"energy {energy} - soft, mellow tones"
    elif 0.1 <= energy < 0.5:
        energy_desc = f"energy {energy} - steady, balanced rhythms"
    else:
        energy_desc = f"energy {energy} - intense, powerful vibrations"

    # Timbre based on spectral features
    spectral_centroid, spectral_rolloff, spectral_bandwidth = spectral_features
    if spectral_centroid < 1000:
        timbre_desc = f"spectral centroid {spectral_centroid} - dark and resonant"
    elif spectral_centroid < 3000:
        timbre_desc = f"spectral centroid {spectral_centroid} - warm and balanced"
    else:
        timbre_desc = f"spectral centroid {spectral_centroid} - bright and sharp"

    if spectral_rolloff < 0.85:
        timbre_desc += " with low, mellow frequencies"
    else:
        timbre_desc += " with high, piercing frequencies"

    if spectral_bandwidth < 1500:
        timbre_desc += " and a smooth texture"
    else:
        timbre_desc += " with a rough, textured feel"

    # Optional link to the previous image's caption for story continuity
    link_to_previous = (
        f"Building from the last scene: '{previous_caption}', "
        if previous_caption
        else ""
    )

    # Optional user style
    style_desc = (
        f"in a style inspired by {user_style}"
        if user_style
        else "in a cinematic and expressive style"
    )

    # Construct the prompt
    prompt = (
        f"{link_to_previous}Frame {current_image_index + 1} of {num_images}: "
        f"depicting a scene inspired by the lyrics: '{current_segment_lyrics}'. "
        f"The mood is {tempo_desc}, {key_desc}, {energy_desc}, and the timbre has {timbre_desc}. "
        f"Render this scene {style_desc}. Each frame captures the essence of the song's journey, "
        f"with visuals that reflect the music's mood and intensity."
        f"The entire song lyrics are: {lyrics}"
    )

    return prompt


# Function to generate multiple prompts for the song
def generate_prompts_for_segments(
    audio_file, folder_name, segment_duration=SEGMENT_DURATION
):
    # Load the full song to determine its length
    y, sr = librosa.load(audio_file)
    song_length = librosa.get_duration(y=y, sr=sr)
    generate_chunks(audio_file, folder_name, segment_duration)

    prompts = []
    i = 0
    for start_time in np.arange(0, song_length, segment_duration):
        lyrics = model(f"{folder_name}/chunk_{i}.wav")["text"]
        i += 1
        end_time = start_time + segment_duration
        # Extract features for each segment
        tempo, beats = extract_tempo_and_beats(audio_file)
        key = extract_key(audio_file, start_time, end_time)
        energy = extract_energy(audio_file, start_time, end_time)
        spectral_features = extract_spectral_features(audio_file, start_time, end_time)

        # Create a visual prompt for this segment
        prompt = create_prompt(
            tempo, key, energy, spectral_features, start_time, lyrics
        )
        prompts.append(prompt)
        print(f"Progress: {round((end_time/song_length)*100, 2)}%")

    return prompts


def generate_chunks(audio_file, folder_name, segment_duration=SEGMENT_DURATION):
    print("Generating chunks...")
    # Load the full song to determine its length
    y, sr = librosa.load(audio_file)
    song_length = librosa.get_duration(y=y, sr=sr)

    # Create a folder to store the chunks if not already exists
    # Delete all existing chunks
    if not os.path.exists(folder_name):
        os.makedirs(folder_name)

    for file in os.listdir(folder_name):
        file_path = os.path.join(folder_name, file)
        if file.startswith("chunk_"):
            os.remove(file_path)

    i = 0
    for start_time in np.arange(0, song_length, segment_duration):
        y, sr = librosa.load(
            audio_file, sr=None, offset=start_time, duration=segment_duration
        )
        write_path = f"./{folder_name}/chunk_{i}.wav"
        sf.write(write_path, y, sr)
        i += 1


def process_chunk(
    audio_file, folder_name, entire_lyrics, chunk_index, segment_duration, num_chunks
):
    print(f"Processing chunk {chunk_index}...")
    start_time = chunk_index * segment_duration
    end_time = start_time + segment_duration
    lyrics = model(f"{folder_name}/chunk_{chunk_index}.wav")["text"]

    print(f"Lyrics for chunk {chunk_index}: {lyrics}")

    # check if the lyrics generated are actually something if errored out it genrates something like ស្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្្, basically a bunch of gibberish non alphabet or punctuation based characters
    if not check_if_valid_lyrics(lyrics):
        print(
            f"Error processing chunk {chunk_index}, Invalid lyrics generated. Generated lyrics: {lyrics}"
        )
        lyrics = "No lyrics in this section of the song."

    tempo, beats = extract_tempo_and_beats(audio_file)
    key = extract_key(audio_file, start_time, end_time)
    energy = extract_energy(audio_file, start_time, end_time)
    spectral_features = extract_spectral_features(audio_file, start_time, end_time)

    print("Creating prompt...")

    if chunk_index == 0:
        prompt = create_prompt(
            entire_lyrics,
            lyrics,
            tempo,
            key,
            energy,
            spectral_features,
            num_chunks,
            chunk_index,
        )
    else:
        # combine all previous captions with a index e.g "caption 1: caption 2: caption 3"
        previous_captions = [
            chunk_status[i]["caption"] + chunk_status[i]["chunk_lyrics"] for i in range(chunk_index) if i in chunk_status
        ]
        previous_caption = " ".join(
            [f"caption {i+1}: {caption}" for i, caption in enumerate(previous_captions)]
        )
        prompt = create_prompt(
            entire_lyrics,
            lyrics,
            tempo,
            key,
            energy,
            spectral_features,
            num_chunks,
            chunk_index,
            previous_caption,
        )

    print("Generating image...")
    encoded_image, caption = generate_image(prompt, chunk_index)

    with lock:
        chunk_status[chunk_index] = {
            "chunk_lyrics": lyrics,
            "prompt": prompt,
            "image": encoded_image,
            "caption": caption,
        }
    print(f"Chunk {chunk_index} processed.")


def check_if_valid_lyrics(lyrics):
    eng_alphabet = "abcdefghijklmnopqrstuvwxyz"
    numbers = "0123456789"
    punctuation = ".,?!' "
    lyrics = lyrics.lower().strip()
    for char in lyrics:
        if char not in eng_alphabet and char not in numbers and char not in punctuation:
            return False


def generate_image(prompt, chunk_index):
    # send prompt to image generation server
    response = requests.post(
        image_generation_url + "/generate", json={"prompt": prompt}
    )
    # response is json with a base64 encoded image as 'image' and a caption as 'caption'

    json_response = response.json()

    encoded_image = json_response.get("image")
    if not encoded_image:
        print(f"Error processing chunk {chunk_index}: {json_response}")
        return

    caption = json_response.get("caption")
    print(f"Caption for chunk {chunk_index}: {caption}")
    return encoded_image, caption


def reset_app():
    global chunk_status
    global executor
    chunk_status = {}
    executor.shutdown(wait=True, cancel_futures=True)
    time.sleep(1)
    executor = ThreadPoolExecutor(max_workers=NUM_WORKERS)
    print("App reset successfully.")


@app.route("/process_audio", methods=["POST"])
def process_audio():
    global model
    global executor
    global total_chunks
    data = request.json
    audio_url = data.get("audio_url")

    # check if the image generation URL is set
    if not image_generation_url:
        return jsonify({"error": "Image generation URL not set"}), 400

    if not audio_url:
        return jsonify({"error": "No audio URL provided"}), 400

    reset_app()

    audio_file = "downloaded_audio.wav"
    folder_name = "audio_data"
    download_audio(audio_url, audio_file)
    print("Audio file downloaded.")

    y, sr = librosa.load(audio_file)
    song_length = librosa.get_duration(y=y, sr=sr)
    num_chunks = int(np.ceil(song_length / SEGMENT_DURATION))

    total_chunks = num_chunks

    # transcribe the entire audio file
    entire_lyrics = model(audio_file, return_timestamps=True)["text"]

    generate_chunks(audio_file, folder_name, segment_duration=SEGMENT_DURATION)

    # Process the rest of the chunks in the background
    for i in range(0, num_chunks):
        executor.submit(
            process_chunk,
            audio_file,
            folder_name,
            entire_lyrics,
            i,
            SEGMENT_DURATION,
            num_chunks,
        )

    return jsonify(
        {
            "message": "Audio processing started, please use the check progress command to check the status",
            "num_chunks": num_chunks,
            "song_lyrics": entire_lyrics,
        }
    )


@app.route("/reset_chunks", methods=["POST"])
def reset_chunks():
    global chunk_status
    chunk_status = {}
    return jsonify({"message": "Chunks reset successfully"})


@app.route("/get_total_chunks", methods=["GET"])
def get_total_chunks():
    return jsonify({"total_chunks": total_chunks})


@app.route("/chunk_status", methods=["GET"])
def get_chunk_status():
    return jsonify(chunk_status)


@app.route("/set_image_generation_url", methods=["POST"])
def set_image_generation_url():
    global image_generation_url
    data = request.json
    url = data.get("url")
    if not url:
        return jsonify({"error": "No URL provided"}), 400
    image_generation_url = url
    return jsonify({"message": "URL set successfully"})


@app.route("/reset", methods=["POST"])
def reset():
    reset_app()
    return jsonify({"message": "App reset successfully"})


@app.route("/")
def hello_world():
    return "Hello, World!"


if __name__ == "__main__":
    print("Loading model...")
    model = pipeline(
        "automatic-speech-recognition", model="openai/whisper-large", device=0
    )
    public_url = ngrok.connect(5000)
    print(f" * Tunnel URL: {public_url}")
    app.run(host="0.0.0.0", port=5000)
