import { useEffect, useState } from "react";
import { api, type Client } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";

const blank = { name: "", phone: "", email: "", company: "", notes: "" };

export function ClientsPage() {
  const [rows, setRows] = useState<Client[]>([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await api.listClients());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(c: Client) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      company: c.company ?? "",
      notes: c.notes ?? "",
    });
  }

  function reset() {
    setEditingId(null);
    setForm(blank);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        company: form.company || null,
        notes: form.notes || null,
      };
      if (editingId) await api.updateClient(editingId, payload);
      else await api.createClient(payload);
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await api.deleteClient(deleteId);
      setDeleteId(null);
      if (editingId === deleteId) reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
      setDeleteId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Guarda quién contrata el servicio y cómo contactarlo."
      />
      {error ? <div className="error-box">{error}</div> : null}

      <div className="split">
        <form className="panel form-grid" onSubmit={onSubmit}>
          <h2>{editingId ? "Editar cliente" : "Nuevo cliente"}</h2>
          <FormField label="Nombre *">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. María López"
              required
            />
          </FormField>
          <div className="grid-2">
            <FormField label="Teléfono">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="Empresa">
            <input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </FormField>
          <FormField label="Notas">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </FormField>
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear cliente"}
            </button>
            {editingId ? (
              <button className="btn ghost" type="button" onClick={reset}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>

        <section className="panel">
          <h2>Listado</h2>
          {loading ? (
            <div className="loading">Cargando…</div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Aún no hay clientes"
              description="Crea el primero con el formulario de la izquierda."
            />
          ) : (
            <div className="list" style={{ marginTop: 12 }}>
              {rows.map((c) => (
                <div key={c.id} className="list-item">
                  <div>
                    <h3>{c.name}</h3>
                    <div className="meta">
                      {[c.company, c.phone, c.email].filter(Boolean).join(" · ") || "Sin contacto"}
                    </div>
                  </div>
                  <div className="page-actions">
                    <button type="button" className="btn" onClick={() => startEdit(c)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => setDeleteId(c.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar cliente"
        message="Si el cliente tiene eventos, puede que no se pueda borrar. ¿Continuar?"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
