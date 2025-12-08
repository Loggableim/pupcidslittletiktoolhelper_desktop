// Particle System Inheritance
class EmojiParticle extends Particle {
  constructor(pos, r) {
    super(pos, r);
  }
	
  show() {
    push();
			this.lifespan -= 0.005;
			imageMode(CENTER);
    	image(fireworksImg, this.pos.x, this.pos.y, this.r, this.r);
    pop();
  }
}