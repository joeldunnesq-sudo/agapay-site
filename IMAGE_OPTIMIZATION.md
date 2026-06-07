# Image Optimization Guide

## Problem
Large unoptimized images are impacting page performance:
- `family.jpg` (7.3 MB) - Must be compressed and converted to WebP
- `censor.png` (1.9 MB) - Must be converted to WebP
- `pantocrator.png` (704 KB) - Should be converted to WebP
- `joel.jpg` (757 KB) - Should be compressed and converted to WebP

## Solution
Convert all images to WebP format with responsive sizes and implement lazy loading with proper fallbacks.

## Steps to Implement

### 1. Generate WebP versions of images

Use ImageMagick or similar tool:

```bash
# Convert JPG to WebP with quality optimization
cwebp -q 80 public/family.jpg -o public/family.webp
cwebp -q 80 public/joel.jpg -o public/joel.webp

# Convert PNG to WebP
cwebp -q 85 public/censor.png -o public/censor.webp
cwebp -q 85 public/pantocrator.png -o public/pantocrator.webp
```

### 2. Create responsive sizes

For `family.jpg` (used once, below the fold):
- `family-768w.webp` (768px width)
- `family-1024w.webp` (1024px width)
- `family-1440w.webp` (1440px width)

For `joel.jpg` (used on about.html and contact.html):
- `joel-400w.webp` (400px width)
- `joel-600w.webp` (600px width)

For `censor.png` and `pantocrator.png`:
- Single optimized WebP version each

### 3. Update HTML to use WebP with lazy loading

Use `<picture>` element for WebP support with fallbacks:

```html
<picture>
  <source srcset="/family-768w.webp 768w, /family-1024w.webp 1024w, /family-1440w.webp 1440w" type="image/webp" />
  <img src="/family.jpg" alt="Family image" loading="lazy" decoding="async" />
</picture>
```

### 4. Add decoding="async" to non-critical images

Allows browser to decode images asynchronously without blocking main thread.

## Expected Performance Gains

- **family.jpg**: 7.3 MB → ~400-800 KB (WebP) = ~90% reduction
- **censor.png**: 1.9 MB → ~200-400 KB (WebP) = ~80% reduction
- **pantocrator.png**: 704 KB → ~100-150 KB (WebP) = ~75% reduction
- **joel.jpg**: 757 KB → ~80-150 KB (WebP) = ~80% reduction

**Total image size reduction: ~9 MB → ~1 MB (~90% reduction)**

## Implementation Priority

1. High: family.jpg (7.3 MB) - largest impact
2. High: censor.png (1.9 MB)
3. Medium: pantocrator.png + joel.jpg
4. Add lazy loading to all images below fold

## Browser Support

WebP is supported in all modern browsers (>97% of users). IE11 and older Android will fall back to original format.
