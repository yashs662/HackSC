from flask import Flask, request, send_file, render_template_string
from pyngrok import ngrok
from diffusers import DiffusionPipeline
import torch
from PIL import Image
import io

app = Flask(__name__)

# Initialize the Stable Diffusion pipeline
pipeline = DiffusionPipeline.from_pretrained(
    "stabilityai/stable-diffusion-3-medium-diffusers",
    torch_dtype=torch.float16
)
pipeline.to("cuda")  # Use "cpu" if CUDA is not available
pipeline.enable_sequential_cpu_offload()

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
    {% if image_url %}
    <h2>Generated Image:</h2>
    <img src="{{ image_url }}" alt="Generated Image">
    {% endif %}
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
        return "Please provide a prompt.", 400

    # Generate the image
    with torch.autocast("cuda"):
        image = pipeline(prompt).images[0]

    # Save image to a BytesIO object
    img_io = io.BytesIO()
    image.save(img_io, 'PNG')
    img_io.seek(0)

    # Serve the image
    return send_file(img_io, mimetype='image/png')

if __name__ == '__main__':
    # Set ngrok authtoken
    ngrok.set_auth_token("ngrok authtoken")

    # Open an HTTP tunnel on the default port 5000
    public_url = ngrok.connect(5000)
    print(f" * ngrok tunnel \"{public_url}\" -> \"http://127.0.0.1:5000\"")

    # Run the Flask application
    app.run(port=5000)
