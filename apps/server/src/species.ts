export interface Species {
  name: string;
  category: string;
  light: string;
  watering: string;
  temperature: string;
  soil: string;
  cycle: string;
}

const entries = [
  ["Papa", "Cultivo", "Sol directo", "Suelo húmedo, sin encharcar", "12–20 °C", "Franco, pH 5.0–6.5", "90–150 días"],
  ["Café", "Cultivo", "Sol filtrado", "Regular; evitar sequía prolongada", "18–24 °C", "Franco, pH 5.0–6.0", "2–3 años"],
  ["Tomate", "Hortaliza", "6–8 h de sol", "Profundo y constante", "18–27 °C", "Franco, pH 6.0–6.8", "75–100 días"],
  ["Maíz", "Cultivo", "Sol directo", "Mayor demanda en floración", "18–32 °C", "Franco, pH 5.5–7.0", "90–150 días"],
  ["Plátano", "Frutal", "Sol directo", "Abundante y frecuente", "20–30 °C", "Profundo, pH 5.5–7.0", "9–18 meses"],
  ["Aguacate", "Frutal", "Sol directo", "Moderado, buen drenaje", "16–30 °C", "Franco, pH 5.5–6.5", "2–4 años"],
  ["Fresa", "Frutal", "Sol directo", "Frecuente, sin mojar flores", "15–25 °C", "Franco, pH 5.5–6.5", "90–120 días"],
  ["Cacao", "Cultivo", "Sombra parcial", "Regular y abundante", "21–32 °C", "Profundo, pH 6.0–7.0", "3–5 años"],
  ["Yuca", "Cultivo", "Sol directo", "Bajo a moderado", "20–30 °C", "Suelto, pH 5.5–7.5", "8–18 meses"],
  ["Arroz", "Cultivo", "Sol directo", "Alto según sistema", "20–35 °C", "Arcilloso, pH 5.5–7.0", "100–150 días"],
  ["Fríjol", "Hortaliza", "Sol directo", "Moderado", "18–28 °C", "Franco, pH 6.0–7.0", "70–100 días"],
  ["Cebolla", "Hortaliza", "Sol directo", "Regular", "13–24 °C", "Franco, pH 6.0–7.0", "100–150 días"],
  ["Ajo", "Hortaliza", "Sol directo", "Moderado", "12–24 °C", "Suelto, pH 6.0–7.0", "120–180 días"],
  ["Zanahoria", "Hortaliza", "Sol directo", "Regular", "15–22 °C", "Suelto, pH 6.0–6.8", "70–100 días"],
  ["Lechuga", "Hortaliza", "Sol suave", "Frecuente", "10–22 °C", "Franco, pH 6.0–7.0", "45–70 días"],
  ["Repollo", "Hortaliza", "Sol directo", "Regular", "10–22 °C", "Franco, pH 6.0–7.0", "90–120 días"],
  ["Brócoli", "Hortaliza", "Sol directo", "Regular", "15–22 °C", "Franco, pH 6.0–7.0", "80–120 días"],
  ["Pepino", "Hortaliza", "Sol directo", "Frecuente", "18–30 °C", "Franco, pH 6.0–7.0", "50–70 días"],
  ["Pimentón", "Hortaliza", "Sol directo", "Constante, sin excesos", "18–30 °C", "Franco, pH 6.0–6.8", "90–120 días"],
  ["Ají", "Hortaliza", "Sol directo", "Moderado", "20–30 °C", "Franco, pH 5.5–7.0", "90–150 días"],
  ["Calabacín", "Hortaliza", "Sol directo", "Abundante", "18–30 °C", "Franco, pH 6.0–7.0", "45–65 días"],
  ["Ahuyama", "Hortaliza", "Sol directo", "Moderado", "20–30 °C", "Franco, pH 6.0–7.0", "90–120 días"],
  ["Papaya", "Frutal", "Sol directo", "Regular, buen drenaje", "22–30 °C", "Franco, pH 5.5–7.0", "8–12 meses"],
  ["Mango", "Frutal", "Sol directo", "Moderado, profundo", "24–32 °C", "Franco, pH 5.5–7.5", "3–6 años"],
  ["Cítricos", "Frutal", "Sol directo", "Regular", "18–30 °C", "Franco, pH 5.5–6.5", "2–4 años"],
  ["Guayaba", "Frutal", "Sol directo", "Moderado", "20–30 °C", "Franco, pH 5.0–7.0", "2–3 años"],
  ["Piña", "Frutal", "Sol directo", "Bajo a moderado", "20–30 °C", "Arenoso, pH 4.5–6.5", "14–20 meses"],
  ["Maracuyá", "Frutal", "Sol directo", "Regular", "20–30 °C", "Franco, pH 5.5–6.5", "8–12 meses"],
  ["Mora", "Frutal", "Sol directo", "Regular", "12–20 °C", "Franco, pH 5.5–6.5", "8–12 meses"],
  ["Granadilla", "Frutal", "Sol directo", "Regular", "15–22 °C", "Franco, pH 5.5–6.5", "10–14 meses"],
  ["Albahaca", "Aromática", "Sol directo", "Cuando se seque la superficie", "18–30 °C", "Suelto, pH 6.0–7.0", "60–90 días"],
  ["Cilantro", "Aromática", "Sol suave", "Regular", "15–25 °C", "Franco, pH 6.0–7.0", "35–60 días"],
  ["Hierbabuena", "Aromática", "Sol parcial", "Frecuente", "15–28 °C", "Húmedo, pH 6.0–7.0", "Perenne"],
  ["Romero", "Aromática", "Sol directo", "Escaso, dejar secar", "15–30 °C", "Arenoso, pH 6.0–7.5", "Perenne"],
  ["Tomillo", "Aromática", "Sol directo", "Escaso", "15–28 °C", "Suelto, pH 6.0–8.0", "Perenne"],
  ["Orégano", "Aromática", "Sol directo", "Moderado a escaso", "15–30 °C", "Suelto, pH 6.0–8.0", "Perenne"],
  ["Monstera", "Interior", "Luz indirecta", "Al secarse primeros centímetros", "18–30 °C", "Aireado, pH 5.5–7.0", "Perenne"],
  ["Sábila", "Interior", "Luz brillante", "Escaso; dejar secar", "15–30 °C", "Arenoso, pH 6.0–8.0", "Perenne"],
  ["Suculenta", "Interior", "Luz brillante", "Escaso; dejar secar por completo", "15–30 °C", "Muy drenante, pH 5.5–7.5", "Perenne"],
  ["Orquídea", "Ornamental", "Luz indirecta", "Cuando raíces se vean plateadas", "18–28 °C", "Sustrato aireado, pH 5.5–6.5", "Perenne"],
  ["Anturio", "Ornamental", "Luz indirecta", "Mantener ligeramente húmedo", "18–28 °C", "Orgánico, pH 5.5–6.5", "Perenne"],
  ["Poto", "Interior", "Luz indirecta", "Cuando se seque la superficie", "18–30 °C", "Universal, pH 6.0–7.0", "Perenne"],
  ["Sansevieria", "Interior", "Luz indirecta", "Muy escaso", "15–30 °C", "Muy drenante, pH 6.0–7.5", "Perenne"],
  ["Helecho", "Interior", "Luz indirecta", "Frecuente, humedad ambiental", "16–25 °C", "Rico en materia orgánica", "Perenne"],
  ["Calatea", "Interior", "Luz indirecta", "Mantener ligeramente húmedo", "18–27 °C", "Rico, pH 6.0–6.5", "Perenne"],
  ["Violeta africana", "Ornamental", "Luz indirecta", "Por la base cuando seque", "18–24 °C", "Ligero, pH 6.0–6.5", "Perenne"],
  ["Geranio", "Ornamental", "Sol directo", "Moderado", "12–25 °C", "Drenante, pH 6.0–7.0", "Perenne"],
  ["Hortensia", "Ornamental", "Sol suave", "Abundante", "12–24 °C", "Húmedo, pH 5.0–6.5", "Perenne"],
  ["Jazmín", "Ornamental", "Sol parcial", "Regular", "15–30 °C", "Franco, pH 6.0–7.0", "Perenne"],
  ["Crisantemo", "Ornamental", "Sol directo", "Regular", "15–25 °C", "Franco, pH 6.0–7.0", "90–120 días"],
 ] as const;

export const speciesLibrary: Species[] = entries.map(([name, category, light, watering, temperature, soil, cycle]) => ({
  name, category, light, watering, temperature, soil, cycle,
}));
