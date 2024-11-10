from flask import Flask, request, jsonify, render_template_string
from pyngrok import ngrok
from diffusers import DiffusionPipeline
from transformers import VisionEncoderDecoderModel, ViTImageProcessor, AutoTokenizer
import torch
from PIL import Image
import io
import base64

app = Flask(__name__)

# Initialize the Stable Diffusion pipeline
sd_pipeline = DiffusionPipeline.from_pretrained(
    "stabilityai/stable-diffusion-3-medium-diffusers",
    torch_dtype=torch.float16
)
sd_pipeline.to("cuda" if torch.cuda.is_available() else "cpu")
sd_pipeline.enable_sequential_cpu_offload()

# Initialize the ViT-GPT2 image captioning model
caption_model = VisionEncoderDecoderModel.from_pretrained("nlpconnect/vit-gpt2-image-captioning")
feature_extractor = ViTImageProcessor.from_pretrained("nlpconnect/vit-gpt2-image-captioning")
tokenizer = AutoTokenizer.from_pretrained("nlpconnect/vit-gpt2-image-captioning")
caption_model.to("cuda" if torch.cuda.is_available() else "cpu")

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
    prompt = request.json.get('prompt')
    if not prompt:
        return jsonify({"error": "Please provide a prompt."}), 400

    # Generate the image
    with torch.autocast("cuda" if torch.cuda.is_available() else "cpu"):
        image = sd_pipeline(prompt).images[0]

    # Caption the image
    image_for_caption = image.convert("RGB")
    pixel_values = feature_extractor(images=image_for_caption, return_tensors="pt").pixel_values
    pixel_values = pixel_values.to("cuda" if torch.cuda.is_available() else "cpu")

    output_ids = caption_model.generate(pixel_values, max_length=16, num_beams=4)
    caption = tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()

    # Convert image to base64
    buffered = io.BytesIO()
    image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

    # Return JSON response
    return jsonify({"image": img_str, "caption": caption})

if __name__ == '__main__':
    # Set ngrok authtoken
    ngrok.set_auth_token("YOUR_NGROK_AUTH_TOKEN")

    # Open an HTTP tunnel on the default port 5000
    public_url = ngrok.connect(5000)
    print(f" * ngrok tunnel \"{public_url}\" -> \"http://127.0.0.1:5000\"")

    # Run the Flask application
    app.run(port=5000)
