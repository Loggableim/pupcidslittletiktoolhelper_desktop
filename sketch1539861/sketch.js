// Code demostration for the workshop - Introduction to Creative Coding: Interactive Fireworks Party
// Tutorial created by Echo Hui

let fireworks = [];
let fireworksImg;

function preload() {
	fireworksImg = loadImage("___");
}

function setup() {
	createCanvas(windowWidth, windowHeight);
	background(0);
	fill(0);
	rect(0, 0, width, height);
	noStroke();
	
	// fireworks = new Particle({
	// 	pos: createVector(random(width), random(height)),
	// });
}

function draw() {
	fill(0, 8); // background with opacity
	rect(0, 0, width, height);
	
	// add a new firework
	if (random(1) < 0.01) { // around 5% chance of adding a new firework
		 fireworks.push(new Firework({}));
	}
	
	// show the firework
	for (let i = fireworks.length - 1; i >= 0; i--) {
		fireworks[i].show();
		// remove extra fireworks
		if (fireworks[i].done()) {
			fireworks.splice(i, 1);
		}
	}
}