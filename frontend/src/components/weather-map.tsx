"use client";

import { useEffect } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

type Pin = { lat: number; lon: number };

const markerIcon = L.divIcon({
  className: "",
  html: '<div class="field-marker"><div></div></div>',
  iconSize: [26, 26],
  iconAnchor: [4, 24],
});

function MapEvents({ onPick }: { onPick: (pin: Pin) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lon: event.latlng.lng });
    },
  });
  return null;
}

function Recenter({ pin }: { pin: Pin }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([pin.lat, pin.lon], Math.max(map.getZoom(), 10), {
      duration: 0.8,
    });
  }, [map, pin.lat, pin.lon]);
  return null;
}

export default function WeatherMap({
  pin,
  onPick,
}: {
  pin: Pin;
  onPick: (pin: Pin) => void;
}) {
  return (
    <MapContainer
      center={[pin.lat, pin.lon]}
      zoom={10}
      minZoom={3}
      scrollWheelZoom
      className="h-full min-h-[58vh] w-full lg:min-h-screen"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[pin.lat, pin.lon]} icon={markerIcon} />
      <MapEvents onPick={onPick} />
      <Recenter pin={pin} />
    </MapContainer>
  );
}
