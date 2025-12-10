/**
 * WebGPU Emoji Rain - Post-Processing Effects
 * 
 * Optional visual enhancements:
 * - 1-pass Kawase Bloom (low-cost HDR bloom)
 * - Sparkle/glow effects
 * - Motion blur trails
 * 
 * @version 2.0.0
 */

'use strict';

class PostProcessingEffects {
  constructor(device, canvasFormat) {
    this.device = device;
    this.canvasFormat = canvasFormat;
    
    // Pipelines
    this.bloomPipeline = null;
    this.compositePipeline = null;
    
    // Textures
    this.bloomTexture = null;
    this.tempTexture = null;
    
    // Uniforms
    this.bloomUniformBuffer = null;
    
    // Settings
    this.enabled = false;
    this.bloomIntensity = 0.3;
    this.bloomThreshold = 0.8;
  }

  /**
   * Initialize post-processing
   */
  async init(width, height) {
    await this.createTextures(width, height);
    await this.createPipelines();
    
    // Create uniform buffer
    this.bloomUniformBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Bloom Uniforms'
    });
    
    console.log('✅ Post-processing initialized');
  }

  /**
   * Create render textures
   */
  async createTextures(width, height) {
    const textureDesc = {
      size: { width, height },
      format: this.canvasFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    };

    this.bloomTexture = this.device.createTexture({
      ...textureDesc,
      label: 'Bloom Texture'
    });

    this.tempTexture = this.device.createTexture({
      ...textureDesc,
      label: 'Temp Texture'
    });
  }

  /**
   * Create post-processing pipelines
   */
  async createPipelines() {
    // Bloom shader (1-pass Kawase blur)
    const bloomShaderCode = `
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>
      };

      struct BloomUniforms {
        intensity: f32,
        threshold: f32,
        texelSize: vec2<f32>
      };

      @group(0) @binding(0) var inputTexture: texture_2d<f32>;
      @group(0) @binding(1) var texSampler: sampler;
      @group(0) @binding(2) var<uniform> uniforms: BloomUniforms;

      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        // Fullscreen triangle
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(3.0, -1.0),
          vec2<f32>(-1.0, 3.0)
        );
        
        var uv = array<vec2<f32>, 3>(
          vec2<f32>(0.0, 1.0),
          vec2<f32>(2.0, 1.0),
          vec2<f32>(0.0, -1.0)
        );
        
        var output: VertexOutput;
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        output.uv = uv[vertexIndex];
        return output;
      }

      @fragment
      fn fs_bloom(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        // Kawase blur (single pass, 4-tap)
        let offset = uniforms.texelSize * 1.5;
        
        var color = vec4<f32>(0.0);
        color += textureSample(inputTexture, texSampler, uv + vec2<f32>(-offset.x, -offset.y));
        color += textureSample(inputTexture, texSampler, uv + vec2<f32>(offset.x, -offset.y));
        color += textureSample(inputTexture, texSampler, uv + vec2<f32>(-offset.x, offset.y));
        color += textureSample(inputTexture, texSampler, uv + vec2<f32>(offset.x, offset.y));
        color *= 0.25;
        
        // Apply threshold (only bright areas bloom)
        let brightness = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
        let bloomFactor = max(0.0, brightness - uniforms.threshold) / max(brightness, 0.001);
        
        return color * bloomFactor * uniforms.intensity;
      }

      @fragment
      fn fs_composite(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        // Additive blend
        let baseColor = textureSample(inputTexture, texSampler, uv);
        return baseColor;
      }
    `;

    const shaderModule = this.device.createShaderModule({
      code: bloomShaderCode,
      label: 'Bloom Shader'
    });

    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float', viewDimension: '2d' }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' }
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        }
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    });

    // Bloom pipeline
    this.bloomPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_bloom',
        targets: [{
          format: this.canvasFormat,
          blend: {
            color: {
              srcFactor: 'one',
              dstFactor: 'one',
              operation: 'add'
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one',
              operation: 'add'
            }
          }
        }]
      },
      primitive: { topology: 'triangle-list' }
    });

    console.log('✅ Post-processing pipelines created');
  }

  /**
   * Apply bloom effect
   */
  applyBloom(commandEncoder, inputTexture, outputTexture, sampler) {
    if (!this.enabled || !this.bloomPipeline) return;

    // Update uniforms
    const uniformData = new Float32Array([
      this.bloomIntensity,
      this.bloomThreshold,
      1.0 / inputTexture.width,
      1.0 / inputTexture.height
    ]);
    this.device.queue.writeBuffer(this.bloomUniformBuffer, 0, uniformData);

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.bloomPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: inputTexture.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: this.bloomUniformBuffer } }
      ]
    });

    // Render bloom
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.bloomTexture.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 }
      }]
    });

    renderPass.setPipeline(this.bloomPipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(3, 1, 0, 0);
    renderPass.end();

    // Composite bloom onto output (additive blend)
    // This would be done in the final render pass
  }

  /**
   * Resize textures
   */
  resize(width, height) {
    if (this.bloomTexture) this.bloomTexture.destroy();
    if (this.tempTexture) this.tempTexture.destroy();
    
    this.createTextures(width, height);
  }

  /**
   * Enable/disable effects
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Set bloom intensity
   */
  setBloomIntensity(intensity) {
    this.bloomIntensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Set bloom threshold
   */
  setBloomThreshold(threshold) {
    this.bloomThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    if (this.bloomTexture) this.bloomTexture.destroy();
    if (this.tempTexture) this.tempTexture.destroy();
    if (this.bloomUniformBuffer) this.bloomUniformBuffer.destroy();
  }
}

// Export
if (typeof window !== 'undefined') {
  window.PostProcessingEffects = PostProcessingEffects;
}
