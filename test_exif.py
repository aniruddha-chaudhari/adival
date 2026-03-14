from PIL import Image
from PIL.ExifTags import TAGS

img = Image.open("uploads/photos/IMG_2847.jpg")
exif = img.getexif()
print("EXIF count:", len(exif))

# Get EXIF data properly
data = img._getexif()
print("Raw EXIF data:", data)

# Try using the IFD data
if data:
    for tag, value in data.items():
        tag_name = TAGS.get(tag, tag)
        print(f"  {tag} ({tag_name}): {value}")
