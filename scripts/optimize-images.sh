#!/bin/bash
# Image optimization script - converts images to WebP and generates responsive sizes

set -e

echo "🖼️  Starting image optimization..."

# Install cwebp if not present
if ! command -v cwebp &> /dev/null; then
    echo "Installing libwebp..."
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt-get install -y webp
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew install webp
    fi
fi

# Create webp versions directory
mkdir -p public/images/optimized

# Function to convert and create responsive sizes
convert_image() {
    local source=$1
    local name=$2
    local quality=$3
    
    if [ ! -f "$source" ]; then
        echo "❌ File not found: $source"
        return 1
    fi
    
    echo "📦 Converting $name..."
    
    # Main WebP conversion
    cwebp -q "$quality" "$source" -o "public/images/optimized/${name}.webp"
    
    # Create responsive sizes for large images
    if [[ "$name" == "family" || "$name" == "joel" ]]; then
        # Get original dimensions
        identify "$source" > /dev/null 2>&1 || {
            echo "⚠️  ImageMagick not installed - skipping responsive sizes"
            return 0
        }
        
        # Create smaller versions
        convert "$source" -quality "$quality" -resize 768x "public/images/optimized/${name}-768w.webp"
        convert "$source" -quality "$quality" -resize 1024x "public/images/optimized/${name}-1024w.webp"
        convert "$source" -quality "$quality" -resize 1440x "public/images/optimized/${name}-1440w.webp"
        
        echo "✅ Created responsive sizes for $name"
    else
        echo "✅ Converted $name to WebP"
    fi
}

# Convert large images
convert_image "public/family.jpg" "family" "80"
convert_image "public/joel.jpg" "joel" "80"
convert_image "public/censor.png" "censor" "85"
convert_image "public/pantocrator.png" "pantocrator" "85"

echo ""
echo "📊 Optimization Summary:"
echo "========================"
du -sh public/family.jpg public/images/optimized/family.webp 2>/dev/null | awk '{print "family.jpg: " $1}'
du -sh public/joel.jpg public/images/optimized/joel.webp 2>/dev/null | awk '{print "joel.jpg: " $1}'
du -sh public/censor.png public/images/optimized/censor.webp 2>/dev/null | awk '{print "censor.png: " $1}'
du -sh public/pantocrator.png public/images/optimized/pantocrator.webp 2>/dev/null | awk '{print "pantocrator.png: " $1}'

echo ""
echo "✨ Image optimization complete!"
echo "WebP files are in: public/images/optimized/"
