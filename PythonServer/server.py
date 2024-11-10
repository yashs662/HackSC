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

app = Flask(__name__)
executor = ThreadPoolExecutor(max_workers=1)
lock = threading.Lock()
chunk_status = {}

# Function to download the audio file from the provided URL
def download_audio(url, filename):
    response = requests.get(url)
    with open(filename, 'wb') as file:
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
def create_prompt(tempo, key, energy, spectral_features, segment_time, lyrics):
    # Describing visual elements based on tempo
    if tempo < 60:
        tempo_desc = "slow and calming"
    elif 60 <= tempo < 120:
        tempo_desc = "moderately paced, relaxed"
    else:
        tempo_desc = "fast-paced, energetic"

    # Describing the mood based on key (Major or Minor)
    if key in ["C", "D", "E", "F", "G", "A"]:
        key_desc = f"Key {key} - bright and uplifting"
    else:
        key_desc = f"Key {key} - dark and mysterious"

    # Energy description
    if energy < 0.1:
        energy_desc = f"energy {energy} - soft, mellow tones"
    elif 0.1 <= energy < 0.5:
        energy_desc = f"energy {energy} - steady, balanced rhythms"
    else:
        energy_desc = f"energy {energy} - intense, powerful vibrations"

    # Timbre description based on spectral features
    spectral_centroid, spectral_rolloff, spectral_bandwidth = spectral_features
    if spectral_centroid < 1000:
        timbre_desc = f"spectral centroid {spectral_centroid} - dark and resonant"
    elif spectral_centroid < 3000:
        timbre_desc = f"spectral centroid {spectral_centroid} - warm and balanced"
    else:
        timbre_desc = f"spectral centroid {spectral_centroid} - bright and sharp"

    # Use spectral rolloff to adjust the brightness
    if spectral_rolloff < 0.85:
        timbre_desc += (
            f" spectral rolloff {spectral_rolloff} - with low, mellow frequencies"
        )
    else:
        timbre_desc += (
            f" spectral rolloff {spectral_rolloff} - with high, piercing frequencies"
        )

    # Use bandwidth to describe the texture of the sound
    if spectral_bandwidth < 1500:
        timbre_desc += f" spectral bandwith {spectral_bandwidth} - and a smooth texture"
    else:
        timbre_desc += (
            f" spectral bandwith {spectral_bandwidth} - with a rough, textured feel"
        )

    # Finalizing the prompt with a timestamp reference
    prompt = f"Tempo: {tempo_desc} - {tempo[0]} BPM, {key_desc} overtones. Energy {energy_desc} vibe. The timbre is {timbre_desc}."

    return prompt


# Function to generate multiple prompts for the song
def generate_prompts_for_segments(audio_file, folder_name, segment_duration=10):
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


def generate_chunks(audio_file, folder_name, segment_duration=10):
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


def process_chunk(audio_file, folder_name, chunk_index, segment_duration):
    start_time = chunk_index * segment_duration
    end_time = start_time + segment_duration
    lyrics = model(f"{folder_name}/chunk_{chunk_index}.wav")["text"]
    tempo, beats = extract_tempo_and_beats(audio_file)
    key = extract_key(audio_file, start_time, end_time)
    energy = extract_energy(audio_file, start_time, end_time)
    spectral_features = extract_spectral_features(audio_file, start_time, end_time)
    prompt = create_prompt(tempo, key, energy, spectral_features, start_time, lyrics)
    with lock:
        chunk_status[chunk_index] = prompt
    print(f"Chunk {chunk_index} processed.")

@app.route('/process_audio', methods=['POST'])
def process_audio():
    global model
    data = request.json
    audio_url = data.get('audio_url')
    if not audio_url:
        return jsonify({"error": "No audio URL provided"}), 400

    audio_file = "downloaded_audio.wav"
    folder_name = "audio_data"
    download_audio(audio_url, audio_file)

    y, sr = librosa.load(audio_file)
    song_length = librosa.get_duration(y=y, sr=sr)
    num_chunks = int(np.ceil(song_length / 10))

    generate_chunks(audio_file, folder_name, segment_duration=10)

    # Process the first chunk and send the response
    process_chunk(audio_file, folder_name, 0, 10)
    response = chunk_status[0]

    # Process the rest of the chunks in the background
    for i in range(1, num_chunks):
        executor.submit(process_chunk, audio_file, folder_name, i, 10)

    return jsonify({"first_chunk_prompt": response, "num_chunks": num_chunks})

@app.route('/chunk_status', methods=['GET'])
def get_chunk_status():
    return jsonify(chunk_status)

# create a hello world route
@app.route('/')
def hello_world():
    return 'Hello, World!'

if __name__ == "__main__":
    print("Loading model...")
    model = pipeline("automatic-speech-recognition", model="openai/whisper-large", device=0)
    public_url = ngrok.connect(5000)
    print(f" * Tunnel URL: {public_url}")
    app.run(host='0.0.0.0', port=5000)