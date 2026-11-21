import { db, setSetting, transaction } from "./db.js";

export function seedDemo(): void {
  const existing = db.prepare("SELECT COUNT(*) AS total FROM plants").get() as { total: number };
  if (existing.total > 0) return;

  const insertPlant = db.prepare(`INSERT INTO plants (name,species,mode,location,planted_at,area,notes)
    VALUES (@name,@species,@mode,@location,@plantedAt,@area,@notes)`);
  const insertTask = db.prepare("INSERT INTO tasks (title,due_date,category,plant_id) VALUES (?,?,?,?)");
  const insertJournal = db.prepare("INSERT INTO journal (title,detail,category,created_at,plant_id) VALUES (?,?,?,?,?)");
  const insertReading = db.prepare(`INSERT INTO soil_readings (plant_id,moisture,temperature,ph,depth,source,created_at)
    VALUES (?,?,?,?,?,?,?)`);

  const create = transaction(() => {
    const plants = [
      ["Lote La Esperanza", "Papa", "agronomo", "Usaquén, Bogotá", 2.4, "Lote demostrativo; seguimiento de humedad y tizón."],
      ["Parcela El Cafetal", "Café", "agronomo", "Fusagasugá, Cundinamarca", 1.8, "Café en etapa productiva."],
      ["Tomates del invernadero", "Tomate", "agronomo", "Bogotá, Colombia", 0.3, "Revisar ventilación y humedad foliar."],
      ["Monstera", "Monstera", "hogar", "Sala", 1, "Luz indirecta brillante."],
      ["Sábila", "Sábila", "hogar", "Balcón", 1, "Dejar secar el sustrato entre riegos."],
      ["Albahaca", "Albahaca", "hogar", "Cocina", 1, "Cosecha frecuente de hojas."],
      ["Suculenta", "Suculenta", "hogar", "Escritorio", 1, "Maceta con drenaje."],
    ];
    const ids = plants.map(([name, species, mode, location, area, notes], index) => Number(insertPlant.run({
      name, species, mode, location, area, notes,
      plantedAt: new Date(Date.now() - (index + 6) * 86400000).toISOString().slice(0, 10),
    }).lastInsertRowid));

    const today = new Date();
    const todo = [
      ["Revisar humedad a 20 cm", 0, "Monitoreo", 0],
      ["Inspeccionar hojas por manchas", 0, "Sanidad", 2],
      ["Regar cuando seque la superficie", 1, "Riego", 3],
      ["Registrar cosecha de albahaca", 2, "Cosecha", 5],
      ["Revisar drenaje de la parcela", 3, "Monitoreo", 1],
      ["Girar la maceta para crecimiento uniforme", 4, "Cuidado", 6],
    ] as const;
    todo.forEach(([title, offset, category, plantIndex], index) => {
      insertTask.run(title, new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10), category, ids[plantIndex]);
      if (index === 5) db.prepare("UPDATE tasks SET completed=1 WHERE id=last_insert_rowid()").run();
    });

    insertJournal.run("Lectura de humedad", "Humedad estable; se pospone el riego hasta nueva revisión.", "Monitoreo", new Date().toISOString(), ids[0]);
    insertJournal.run("Revisión de hojas", "Se observan algunas manchas; hacer seguimiento fotográfico y revisar ventilación.", "Sanidad", new Date(Date.now() - 3600000).toISOString(), ids[2]);
    insertJournal.run("Cuidado de hojas", "Limpieza suave con paño húmedo y revisión del sustrato.", "Cuidado", new Date(Date.now() - 7200000).toISOString(), ids[3]);

    ids.forEach((id, plantIndex) => {
      for (let day = 29; day >= 0; day--) {
        const moisture = Math.max(18, Math.min(68, 43 + Math.sin(day * 0.48 + plantIndex) * 11 + Math.cos(day * 0.21) * 6));
        const timestamp = new Date(Date.now() - day * 86400000).toISOString();
        insertReading.run(id, Math.round(moisture), 15 + Math.sin(day * 0.3) * 4, 5.8, "20 cm", "simulador", timestamp);
      }
    });
  });
  create();
  setSetting("demo_seeded", "true");
}
