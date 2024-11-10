import logging
from flask import Flask, request, jsonify, render_template_string
from pyngrok import ngrok
from diffusers import DiffusionPipeline
from transformers import VisionEncoderDecoderModel, ViTImageProcessor, AutoTokenizer, AutoModelForCausalLM, BlipProcessor, BlipForConditionalGeneration, Blip2Processor, Blip2ForConditionalGeneration
import torch
from PIL import Image
import io
import base64
import re

app = Flask(__name__)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the Stable Diffusion pipeline
try:
    logger.info("Loading Stable Diffusion pipeline...")
    sd_pipeline = DiffusionPipeline.from_pretrained(
        "stabilityai/stable-diffusion-3-medium-diffusers",
        torch_dtype=torch.float16
    )
    device = "cuda" if torch.cuda.is_available() else "cpu"
    sd_pipeline.to(device)
    sd_pipeline.enable_sequential_cpu_offload()
    logger.info("Stable Diffusion pipeline loaded successfully.")
except Exception as e:
    logger.error(f"Error loading Stable Diffusion pipeline: {e}")
    raise

# Initialize the GPT-2 model for prompt transformation
try:
    logger.info("Loading SmolLm2 model for prompt transformation...")
    from transformers import AutoModelForCausalLM, AutoTokenizer
    checkpoint = "HuggingFaceTB/SmolLM2-1.7B-Instruct"
    device = "cuda" # for GPU usage or "cpu" for CPU usage
    tokenizer = AutoTokenizer.from_pretrained(checkpoint)
    # for multiple GPUs install accelerate and do `model = AutoModelForCausalLM.from_pretrained(checkpoint, device_map="auto")`
    model = AutoModelForCausalLM.from_pretrained(checkpoint).to(device)
    logger.info("SmolLm2 model loaded successfully.")
    
except Exception as e:
    logger.error(f"Error loading SmolLm2 model: {e}")
    raise

# HTML template for the web interface
html_template = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Stable Diffusion Image Generator</title>
</head>
<body>
    <h1>Stable Diffusion Image Generator</h1>
    <form method="post" action="/generate">
        <label for="prompt">Enter your prompt:</label><br>
        <input type="text" id="prompt" name="prompt" required><br><br>
        <input type="submit" value="Generate Image">
    </form>
</body>
</html>
'''

@app.route('/', methods=['GET'])
def home():
    return render_template_string(html_template)

@app.route('/generate', methods=['POST'])
def generate():
    try:
        prompt = request.json.get('prompt')
        if not prompt:
            return jsonify({"error": "Please provide a prompt."}), 400

        logger.info(f"Received original prompt: {prompt}")

        # Transform the prompt using the SmolLm2 model
        messages = [{"role": "user", "content": prompt}]
        input_text=tokenizer.apply_chat_template(messages, tokenize=False)
        inputs = tokenizer.encode(input_text, return_tensors="pt").to(device)
        outputs = model.generate(inputs, max_new_tokens=100, temperature=0.2, top_p=0.9, do_sample=True)
        transformed_prompt = tokenizer.decode(outputs[0])
        transformed_prompt = re.search(r"<\|im_start\|>assistant(.*?)(<\|im_end\|>|$)", transformed_prompt, re.DOTALL).group(1).strip()
        logger.info(f"Transformed prompt: {transformed_prompt}")

        # Generate the image using the transformed prompt
        with torch.autocast(device):
            image = sd_pipeline(transformed_prompt, height = 512, width = 512).images[0]

        caption = "test"

        # Convert image to base64 with lower quality
        buffered = io.BytesIO()
        image.save(buffered, format="PNG", quality=80)  # Adjust quality (0-100)
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

        # Return JSON response
        return jsonify({"image": img_str, "caption": caption})
    except Exception as e:
        logger.error(f"Error during image generation or captioning: {e}")
        return jsonify({"error": "An error occurred during image generation or captioning."}), 500

if __name__ == '__main__':
    try:
        # Set ngrok authtoken
        ngrok.set_auth_token("2oe51PGMgAbYP4XK6fYJ9REjg5l_xN7W8s2Z9dsPMu6gqBBd")

        # Open an HTTP tunnel on the default port 5000
        public_url = ngrok.connect(5000)
        logger.info(f"ngrok tunnel \"{public_url}\" -> \"http://127.0.0.1:5000\"")

        # Run the Flask application
        app.run(port=5000)
    except Exception as e:
        logger.error(f"Error starting the Flask application: {e}")
