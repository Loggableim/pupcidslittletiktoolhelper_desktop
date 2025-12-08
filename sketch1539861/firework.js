// contains a particle, and the explosion of particles
class Firework {
	constructor(args) {
		let def = {
			// initialize each Firework class with a particle
			// firework: new Particle({
			// 						pos: createVector(random(width), random(height)),
			// 					}),
			
			firework: new EmojiParticle({
									pos: createVector(random(width), random(height - (height / 10), height)), // createVector(random(width), random(height)),
									r: random(30, 35),
								}),
			// array for storing explosion of particles
			particles: [], 
			particlesCount: 0,
			explodeStatus: false,
		};
		Object.assign(def,args);
		Object.assign(this,def);
	}
	
	// check if the particle reaches the highest point
	checkExplodePoint() {
		if (this.firework.vel.y >=0) {
			this.explodeStatus = true;
			this.explode();
		}
	}
	
	explode() {
		let baseHue = 180;
		this.particlesCount = random(30, 60);
		
		for( let i = 0; i < this.particlesCount; i++){
			let hue = random(0,120);
			// let objParticle = new Particle({
			let objParticle = new EmojiParticle({
				pos: createVector(this.firework.pos.x, this.firework.pos.y),
				vel: p5.Vector.random2D().mult(random(2, 5)),
				r: random(this.firework.r / 2, this.firework.r),
				hue: baseHue + hue,
				seed: false,
			})
			this.particles.push(objParticle)
		}
	}
	
	show() {
		push();
			colorMode(HSB);
		
			this.firework.applyForce();
			this.firework.update();
		
			// show the seed particle until it reaches the highest point
			if (!this.explodeStatus) {
				this.checkExplodePoint();
				this.firework.show();
			}
			
			// display fireworks explosion
			// for (let i = 0; i < this.particles.length; i++) {
			for (let i = this.particles.length - 1; i >= 0; i--) {
				this.particles[i].applyForce();
				this.particles[i].update();
				this.particles[i].show();
				
				// remove extra particles when it's faded out
				if (this.particles[i].done()) {
					this.particles.splice(i, 1);
				}
			}
		pop();
	}
	
	done() { 
		// check if the particle exceeds the browser window
		return this.explodeStatus && this.particles.length === 0 ? true : false;
	}
}