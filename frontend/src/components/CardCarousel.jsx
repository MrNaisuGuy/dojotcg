import React from "react";

import "./CardCarousel.css";

function CardCarousel({ images }) {
  return (
    <div className="carousel-container">
      {images.map((image, index) => (
        <img
          key={index}
          src={image}
          alt={`card-${index}`}
          className={`carousel-card card-${index}`}
        />
      ))}
    </div>
  );
}

export default CardCarousel;