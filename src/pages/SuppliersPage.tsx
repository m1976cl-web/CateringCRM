import { useEffect, useState } from "react";
import { api, type Supplier } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader } from "../components/EmptyState";
import { FormField } from "../components/FormField";

const blank = { name: "", contactName: "", phone: "", email: "", notes: "" };

export function SuppliersPage() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await api.listSuppliers());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function reset() {
    setEditingId(null);
    setForm(blank);
  }

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      contactName: s.contactName ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      notes: s.notes ?? "",
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        contactName: form.contactName || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
      };
      if (editingId) await api.updateSupplier(editingId, payload);
      else await api.createSupplier(payload);
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
      await api.deleteSupplier(deleteId);
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
      <PageHeader title="Proveedores" subtitle="Quién te vende cada producto." />
      {error ? <div className="error-box">{error}</div> : null}

      <div className="split">
        <form className="panel form-grid" onSubmit={onSubmit}>
          <h2>{editingId ? "Editar proveedor" : "Nuevo proveedor"}</h2>
          <FormField label="Nombre *">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Contacto">
            <input
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
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
          <FormField label="Notas">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </FormField>
          <div className="form-actions">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            {editingId ? (
              <button type="button" className="btn ghost" onClick={reset}>
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
            <EmptyState title="Sin proveedores" description="Agrega tus proveedores habituales." />
          ) : (
            <div className="list" style={{ marginTop: 12 }}>
              {rows.map((s) => (
                <div key={s.id} className="list-item">
                  <div>
                    <h3>{s.name}</h3>
                    <div className="meta">
                      {[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "Sin datos"}
                    </div>
                  </div>
                  <div className="page-actions">
                    <button type="button" className="btn" onClick={() => startEdit(s)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => setDeleteId(s.id)}
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
        title="Eliminar proveedor"
        message="Los ingredientes quedarán sin proveedor asociado."
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
