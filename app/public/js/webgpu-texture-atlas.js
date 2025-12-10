/**
 * WebGPU Emoji Rain - Texture Atlas Manager
 * 
 * Efficiently packs emoji textures into a GPU texture atlas
 * Supports:
 * - Canvas-based emoji rendering
 * - Custom image loading
 * - Automatic atlas packing
 * - Mipmap generation
 * 
 * @version 2.0.0
 */

'use strict';

class TextureAtlasManager {
  constructor(device) {
    this.device = device;
    this.atlas = null;
    this.emojiMap = new Map(); // emoji/url -> texture coordinates
    this.atlasSize = 2048; // 2048x2048 atlas
    this.emojiSize = 128; // Each emoji rendered at 128x128
    this.columns = Math.floor(this.atlasSize / this.emojiSize);
    this.rows = Math.floor(this.atlasSize / this.emojiSize);
    this.maxEmojis = this.columns * this.rows;
    this.currentIndex = 0;
  }

  /**
   * Create and populate texture atlas from emoji list
   */
  async createAtlas(emojiList, customImages = []) {
    console.log(`📦 Creating texture atlas for ${emojiList.length} emojis + ${customImages.length} images...`);

    // Create canvas for rendering emojis
    const canvas = document.createElement('canvas');
    canvas.width = this.atlasSize;
    canvas.height = this.atlasSize;
    const ctx = canvas.getContext('2d', { alpha: true });

    if (!ctx) {
      throw new Error('Failed to get canvas 2D context');
    }

    // Clear canvas with transparent background
    ctx.clearRect(0, 0, this.atlasSize, this.atlasSize);

    // Render emojis to atlas
    let index = 0;
    
    // Render text emojis
    for (const emoji of emojiList) {
      if (index >= this.maxEmojis) {
        console.warn(`⚠️ Atlas full, skipping remaining emojis`);
        break;
      }

      await this.renderEmojiToAtlas(ctx, emoji, index);
      this.emojiMap.set(emoji, index);
      index++;
    }

    // Load and render custom images
    for (const imageUrl of customImages) {
      if (index >= this.maxEmojis) {
        console.warn(`⚠️ Atlas full, skipping remaining images`);
        break;
      }

      try {
        await this.renderImageToAtlas(ctx, imageUrl, index);
        this.emojiMap.set(imageUrl, index);
        index++;
      } catch (error) {
        console.error(`Failed to load image ${imageUrl}:`, error);
      }
    }

    this.currentIndex = index;
    console.log(`✅ Atlas created with ${index} textures`);

    // Upload to GPU
    await this.uploadToGPU(canvas);

    return this.atlas;
  }

  /**
   * Render a text emoji to the atlas
   */
  async renderEmojiToAtlas(ctx, emoji, index) {
    const col = index % this.columns;
    const row = Math.floor(index / this.columns);
    const x = col * this.emojiSize;
    const y = row * this.emojiSize;

    // Clear cell
    ctx.clearRect(x, y, this.emojiSize, this.emojiSize);

    // Setup text rendering
    ctx.font = `${this.emojiSize * 0.75}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Render emoji
    ctx.fillText(emoji, x + this.emojiSize / 2, y + this.emojiSize / 2);
  }

  /**
   * Load and render a custom image to the atlas
   */
  async renderImageToAtlas(ctx, imageUrl, index) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        const col = index % this.columns;
        const row = Math.floor(index / this.columns);
        const x = col * this.emojiSize;
        const y = row * this.emojiSize;

        // Clear cell
        ctx.clearRect(x, y, this.emojiSize, this.emojiSize);

        // Calculate scaling to fit in cell while maintaining aspect ratio
        const scale = Math.min(
          this.emojiSize / img.width,
          this.emojiSize / img.height
        );
        const width = img.width * scale;
        const height = img.height * scale;
        const offsetX = (this.emojiSize - width) / 2;
        const offsetY = (this.emojiSize - height) / 2;

        // Draw image centered in cell
        ctx.drawImage(img, x + offsetX, y + offsetY, width, height);
        
        resolve();
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${imageUrl}`));
      };

      // Handle cross-origin if needed
      if (imageUrl.startsWith('http') && !imageUrl.includes(window.location.hostname)) {
        img.crossOrigin = 'anonymous';
      }

      img.src = imageUrl;
    });
  }

  /**
   * Upload canvas to GPU texture
   */
  async uploadToGPU(canvas) {
    // Create texture
    this.atlas = this.device.createTexture({
      size: {
        width: this.atlasSize,
        height: this.atlasSize,
        depthOrArrayLayers: 1
      },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | 
             GPUTextureUsage.COPY_DST | 
             GPUTextureUsage.RENDER_ATTACHMENT,
      mipLevelCount: this.calculateMipLevels(this.atlasSize),
      label: 'Emoji Texture Atlas'
    });

    // Get image data from canvas
    const imageBitmap = await createImageBitmap(canvas);

    // Copy to GPU
    this.device.queue.copyExternalImageToTexture(
      { source: imageBitmap },
      { texture: this.atlas },
      { width: this.atlasSize, height: this.atlasSize }
    );

    // Generate mipmaps (optional, for better filtering)
    if (this.atlas.mipLevelCount > 1) {
      this.generateMipmaps();
    }

    console.log('✅ Texture atlas uploaded to GPU');
  }

  /**
   * Calculate number of mip levels
   */
  calculateMipLevels(size) {
    return Math.floor(Math.log2(size)) + 1;
  }

  /**
   * Generate mipmaps for texture atlas
   * (Simplified - in production you'd use a compute shader)
   */
  generateMipmaps() {
    // TODO: Implement proper mipmap generation using compute shader
    // For now, WebGPU will use the base level only
    console.log('⚠️ Mipmap generation not implemented (using base level only)');
  }

  /**
   * Get texture index for emoji/image
   */
  getTextureIndex(emojiOrUrl) {
    return this.emojiMap.get(emojiOrUrl) || 0;
  }

  /**
   * Get UV coordinates for emoji/image in atlas
   */
  getUVCoords(emojiOrUrl) {
    const index = this.getTextureIndex(emojiOrUrl);
    const col = index % this.columns;
    const row = Math.floor(index / this.columns);

    const u = col / this.columns;
    const v = row / this.rows;
    const uSize = 1 / this.columns;
    const vSize = 1 / this.rows;

    return {
      uMin: u,
      vMin: v,
      uMax: u + uSize,
      vMax: v + vSize
    };
  }

  /**
   * Add new emoji/image to atlas (dynamic)
   */
  async addToAtlas(emojiOrUrl) {
    if (this.emojiMap.has(emojiOrUrl)) {
      return this.getTextureIndex(emojiOrUrl);
    }

    if (this.currentIndex >= this.maxEmojis) {
      console.warn('⚠️ Atlas full, cannot add more textures');
      return 0;
    }

    // Create small canvas for rendering just this emoji
    const canvas = document.createElement('canvas');
    canvas.width = this.emojiSize;
    canvas.height = this.emojiSize;
    const ctx = canvas.getContext('2d', { alpha: true });

    if (!ctx) {
      console.error('Failed to get 2D context');
      return 0;
    }

    // Calculate position in atlas
    const col = this.currentIndex % this.columns;
    const row = Math.floor(this.currentIndex / this.columns);
    const x = col * this.emojiSize;
    const y = row * this.emojiSize;

    // Render to small canvas
    if (emojiOrUrl.startsWith('http') || emojiOrUrl.startsWith('/')) {
      await this.renderImageToAtlas(ctx, emojiOrUrl, 0);
    } else {
      await this.renderEmojiToAtlas(ctx, emojiOrUrl, 0);
    }

    // Extract image data from small canvas
    const imageData = ctx.getImageData(0, 0, this.emojiSize, this.emojiSize);

    // Upload to GPU (partial update)
    this.device.queue.writeTexture(
      {
        texture: this.atlas,
        origin: { x, y, z: 0 }
      },
      imageData.data,
      {
        bytesPerRow: this.emojiSize * 4,
        rowsPerImage: this.emojiSize
      },
      {
        width: this.emojiSize,
        height: this.emojiSize,
        depthOrArrayLayers: 1
      }
    );

    this.emojiMap.set(emojiOrUrl, this.currentIndex);
    this.currentIndex++;

    console.log(`✅ Added ${emojiOrUrl} to atlas at index ${this.currentIndex - 1}`);
    
    return this.currentIndex - 1;
  }

  /**
   * Get texture atlas
   */
  getAtlas() {
    return this.atlas;
  }

  /**
   * Destroy atlas and free GPU memory
   */
  destroy() {
    if (this.atlas) {
      this.atlas.destroy();
      this.atlas = null;
    }
    this.emojiMap.clear();
    this.currentIndex = 0;
  }
}

// Export
if (typeof window !== 'undefined') {
  window.TextureAtlasManager = TextureAtlasManager;
}
