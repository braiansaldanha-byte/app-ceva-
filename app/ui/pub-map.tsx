"use client";
import { useEffect, useRef, useState } from "react";
import type { Pub } from "../../lib/types";
export default function PubMap({
  pubs,
  onSelect,
  location,
}: {
  pubs: Pub[];
  onSelect: (pub: Pub) => void;
  location: [number, number] | null;
}) {
  const container = useRef<HTMLDivElement>(null),
    selectRef = useRef(onSelect),
    [failed, setFailed] = useState(false);
  const pubsKey = pubs.map(p => `${p.id}:${p.lat}:${p.lng}:${p.name}:${p.neighborhood}`).join("|");
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    let disposed = false,
      instance: import("leaflet").Map | undefined;
    import("leaflet")
      .then((L) => {
        if (disposed || !container.current) return;
        instance = L.map(container.current, { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(
          [-30.0346, -51.2121],
          13,
        );
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        })
          .on("tileerror", () => {
            if (!disposed) setFailed(true);
          })
          .addTo(instance);
        const points: [number, number][] = [];
        pubs.forEach((pub) => {
          points.push([pub.lat, pub.lng]);
          const box = document.createElement("div"),
            title = document.createElement("strong"),
            subtitle = document.createElement("p"),
            button = document.createElement("button");
          title.textContent = pub.name;
          subtitle.textContent = pub.neighborhood;
          button.textContent = "Ver benefícios";
          button.className = "map-popup-button";
          button.addEventListener("click", () => selectRef.current(pub));
          box.appendChild(title);
          box.appendChild(subtitle);
          box.appendChild(button);
          L.marker([pub.lat, pub.lng], {
            icon: L.divIcon({
              className: "cevai-map-pin",
              html: '<img src="/assets/app-icon-192.png" alt="" />',
              iconSize: [36, 42],
              iconAnchor: [18, 40],
            }),
          })
            .addTo(instance!)
            .bindPopup(box);
        });
        if (location) {
          points.push(location);
          L.circleMarker(location, {
            radius: 8,
            color: "#fff",
            fillColor: "#288be8",
            fillOpacity: 1,
            weight: 3,
          }).addTo(instance);
        }
        if (points.length)
          instance.fitBounds(points, { padding: [45, 45], maxZoom: 14, animate: false });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      instance?.stop();
      instance?.remove();
    };
  }, [pubsKey, location]);
  return (
    <div className="map-shell">
      <div
        className="pub-map"
        ref={container}
        aria-label="Mapa dos pubs em Porto Alegre"
      />
      {failed && (
        <p className="map-note">
          O mapa pode depender da conexão. Os pubs continuam disponíveis na
          lista.
        </p>
      )}
    </div>
  );
}
