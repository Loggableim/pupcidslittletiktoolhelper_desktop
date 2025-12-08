// Individual particle
class Particle {
	constructor(args) {
		let def = {
			pos: createVector(0, 0),
			vel: createVector(0, -10),
			acc: createVector(0, 0),
			gForce: createVector(0, 0.1), // gravitational force
			r: random(2,6),
			hue: 360,
			seed: true,
			lifespan: 1,
			color: color('#ffffff'),
			endColor: color('#ffffff'),
		};
		Object.assign(def,args);
		Object.assign(this,def);
	}
	
	applyForce() {
		this.acc.add(this.gForce); // F = ma, here it simplies to F = a * 1
	}
	
	update() {
		this.vel.add(this.acc);
		this.pos.add(this.vel);
		this.acc.mult(0); // clears out the acceleration
	}
	
	show() {
		// displays the particle
		push();
			colorMode(HSB);
			translate(this.pos.x, this.pos.y);
			if (this.seed) {
				fill(this.color);
			} else {
				this.lifespan -= 0.005;
				fill(this.hue, 100, 100, this.lifespan);
			}
			circle(0,0,this.r);
		pop();
	
	}
	
	done() { 
		// check if the particle is faded out
		return this.lifespan <= 0 ? true : false;
	}
}