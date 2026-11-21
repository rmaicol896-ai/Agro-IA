import type { Risk, RiskLevel } from "@agroia/shared";

function levelFor(score: number): RiskLevel {
  if (score >= 80) return "Crítico";
  if (score >= 60) return "Alto";
  if (score >= 35) return "Medio";
  return "Bajo";
}

export function calculateRisks(input: {
  temperature: number;
  humidity: number;
  windSpeed: number;
  rainProbability: number;
  soilMoisture: number;
  et0: number;
  ph?: number;
  species: string[];
}): Risk[] {
  const risks: Risk[] = [];
  const add = (id: string, title: string, score: number, reason: string, recommendation: string) => {
    risks.push({ id, title, score, level: levelFor(score), reason, recommendation });
  };

  const fungalCrop = input.species.some((name) => /papa|tomate/i.test(name));
  if (input.humidity >= 85 && input.temperature >= 10 && input.temperature <= 25) {
    const score = Math.min(95, 48 + Math.round((input.humidity - 85) * 1.8) + (fungalCrop ? 20 : 0));
    add("fungal", fungalCrop ? "Humedad y riesgo de tizón" : "Condiciones favorables para hongos", score,
      `Humedad relativa de ${input.humidity}% y temperatura de ${input.temperature} °C; ${fungalCrop ? "hay papa o tomate registrados" : "la combinación puede favorecer enfermedades fúngicas"}.`,
      "Revisa el envés de las hojas y mejora la ventilación. Evita mojar el follaje; confirma el diagnóstico antes de cualquier tratamiento.");
  }
  if (input.soilMoisture < 25 && input.et0 >= 3) {
    add("drought", "Estrés hídrico", Math.min(95, 45 + Math.round((25 - input.soilMoisture) * 1.2) + Math.round(input.et0 * 2)),
      `Humedad estimada del suelo de ${input.soilMoisture}% y ET₀ de ${input.et0} mm/día.`,
      "Verifica la humedad a profundidad de raíz y prioriza un riego gradual si el cultivo lo necesita.");
  }
  if (input.soilMoisture >= 85 || (input.rainProbability >= 75 && input.soilMoisture >= 70)) {
    add("waterlogging", "Exceso de agua", Math.min(95, 40 + Math.round((input.soilMoisture - 70) * 1.5) + (input.rainProbability >= 75 ? 10 : 0)),
      `Humedad del suelo de ${input.soilMoisture}%${input.rainProbability >= 75 ? ` y probabilidad de lluvia de ${input.rainProbability}%` : ""}.`,
      "Comprueba el drenaje y aplaza el riego hasta confirmar que la zona de raíces lo requiere.");
  }
  if (input.species.length > 0 && input.temperature >= 25 && input.humidity <= 70) {
    add("pest-conditions", "Condiciones favorables para algunas plagas", Math.min(75, 35 + Math.round((input.temperature - 25) * 3)),
      `Temperatura de ${input.temperature} °C y humedad relativa de ${input.humidity}%; no se cuenta con conteo de insectos ni grados-día específicos.`,
      "Inspecciona brotes y envés de hojas para confirmar presencia; registra hallazgos antes de decidir un control.");
  }
  if (input.ph !== undefined && (input.ph < 5 || input.ph > 7.5)) {
    add("nutrition-ph", "Revisar pH y disponibilidad de nutrientes", 45,
      `La última lectura de pH es ${input.ph}; está fuera del intervalo general de 5.0–7.5.`,
      "Confirma con una medición calibrada y análisis de suelo. Evita corregir pH sin conocer el cultivo y el análisis completo.");
  }
  if (input.temperature <= 3) {
    add("frost", "Posible helada", Math.min(100, 60 + Math.round((3 - input.temperature) * 10)),
      `Temperatura actual o mínima cercana a ${input.temperature} °C.`,
      "Protege plantas sensibles y consulta el pronóstico local antes de tomar medidas.");
  }
  if (input.temperature >= 32) {
    add("heat", "Estrés por calor", Math.min(95, 40 + (input.temperature - 32) * 5),
      `Temperatura de ${input.temperature} °C, por encima de 32 °C.`,
      "Revisa signos de marchitez, conserva humedad uniforme y evita labores intensas en las horas más cálidas.");
  }
  if (input.windSpeed >= 35) {
    add("wind", "Viento fuerte", Math.min(95, 40 + Math.round((input.windSpeed - 35) * 1.5)),
      `Viento de ${input.windSpeed} km/h.`,
      "Asegura plantas altas y pospón aplicaciones; el viento aumenta deriva y exposición.");
  }
  if (input.temperature < 8) {
    add("cold", "Temperatura baja", 40 + Math.round((8 - input.temperature) * 5),
      `Temperatura de ${input.temperature} °C, inferior a 8 °C.`,
      "Observa daños por frío y protege las especies sensibles según su etapa.");
  }
  if (input.rainProbability < 20 && input.windSpeed < 15 && input.temperature >= 10 && input.temperature <= 28) {
    add("spray-window", "Ventana de aplicación (condiciones)", 20,
      `Viento de ${input.windSpeed} km/h, lluvia probable ${input.rainProbability}% y temperatura ${input.temperature} °C.`,
      "Las condiciones meteorológicas parecen tranquilas; verifica siempre la etiqueta, el registro ICA y consulta a un ingeniero agrónomo. No se sugieren dosis.");
  }
  if (risks.length === 0) {
    add("stable", "Condiciones estables", 12, "No se activaron umbrales prioritarios con los datos disponibles.", "Continúa el monitoreo y registra cambios en campo.");
  }
  return risks.sort((a, b) => b.score - a.score);
}

export function irrigationPlan(input: {
  et0: number;
  kc: number;
  areaM2: number;
  effectiveRainMm: number;
  soilMoisturePercent: number;
  mode: "agronomo" | "hogar";
}) {
  const netMm = Math.max(0, input.et0 * input.kc - input.effectiveRainMm);
  const adjustment = input.soilMoisturePercent < 25 ? 1.15 : input.soilMoisturePercent > 70 ? 0.4 : 0.8;
  const suggestedMm = Math.round(netMm * adjustment * 10) / 10;
  const litres = Math.round(suggestedMm * Math.max(input.areaM2, 0.01) * 10) / 10;
  return {
    suggestedMm,
    litres,
    glasses: Math.max(1, Math.round(litres / 0.25)),
    explanation: input.mode === "hogar"
      ? `Aproximadamente ${litres} litros (unos ${Math.max(1, Math.round(litres / 0.25))} vasos de 250 ml) como referencia para el área indicada.`
      : `${suggestedMm} mm netos estimados (${litres} litros para ${input.areaM2} m²). Ajusta con mediciones de campo.`,
  };
}

export function offlineAnswer(question: string, mode: "agronomo" | "hogar", species?: string): string {
  const lower = question.toLocaleLowerCase("es-CO");
  const subject = species ? ` para ${species}` : "";
  let advice = "Observa la planta y el suelo antes de intervenir. Riega solo si la zona de raíces está seca y revisa el pronóstico de lluvia.";
  if (/riego|regar|agua|sedienta/.test(lower)) {
    advice = mode === "hogar"
      ? "Toca la tierra a 2–3 cm: si está seca, riega despacio hasta humedecer el sustrato y deja drenar. Si sigue húmeda, espera y vuelve a revisar mañana."
      : "Comprueba humedad en la zona radicular, etapa del cultivo y lluvia efectiva. Usa ET₀ × Kc como referencia, descuenta lluvia y valida con mediciones antes de programar el riego.";
  } else if (/hongo|mancha|plaga|hoja|enfermedad/.test(lower)) {
    advice = "Aísla la planta si es posible, toma fotos de ambas caras de la hoja y revisa tallos, distribución de síntomas y humedad. Mejora ventilación y evita mojar el follaje. La identificación es orientativa.";
  } else if (/abono|fertiliz|nutriente/.test(lower)) {
    advice = "Antes de fertilizar, revisa la etapa de crecimiento y, en cultivos, el análisis de suelo. No mezcles productos sin indicación profesional y sigue siempre la etiqueta.";
  }
  return `### Diagnóstico probable\nCon la información disponible no es posible confirmar una causa${subject}.\n\n### Causas posibles\nEl riego, el drenaje, el clima y la etapa de crecimiento pueden influir. Comparte fotos y síntomas para afinar la orientación.\n\n### Acciones recomendadas\n1. ${advice}\n2. Registra fecha, clima y cambios observados para comparar.\n\n### Prevención\nMantén drenaje adecuado y revisa la planta con regularidad; evita cambios bruscos de riego.\n\n### Cuándo consultar\nSi el daño se extiende, afecta tallos o frutos, o el cultivo tiene valor comercial, consulta a un ingeniero agrónomo. Para productos fitosanitarios, verifica etiqueta y registro ICA; no apliques dosis sin recomendación profesional.\n\n**Certeza: baja** — orientación local basada en reglas, no reemplaza un diagnóstico profesional.`;
}
