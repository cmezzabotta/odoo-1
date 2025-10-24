# POS Mercado Pago Direct (Odoo 19)

**Mínimo viable** para cobrar con Mercado Pago en el POS:
- Botón en la pantalla de pago.
- Genera una orden QR dinámica (sin redireccionamientos) lista para escanear desde la app de Mercado Pago.
- Polling por estado `approved` vía `merchant_orders` (hasta 60s).
- Si aprueba: agrega línea de pago con método marcado `mp_enabled` y valida ticket.

## Configuración
1) Ajustes → **Mercado Pago (POS)**: cargue *Access Token*, *Collector ID*, *POS ID* y (opcional) *Public Key*.
2) POS → **Métodos de Pago**: marque **Mercado Pago (Directo)** en el método que usará.  
3) Abra el POS, haga una venta y pulse el botón **Mercado Pago**.

## Rutas
- `/mp/pos/create` (JSON): crea orden QR dinámica.
- `/mp/pos/status` (JSON): consulta estado por `in_store_order_id` o `external_reference`.

> Mejora sugerida: agregar **webhook** para confirmación inmediata y registro contable avanzado.

## Notas
- Usa `requests` para la API de MP (sin SDK). El servidor debe tener salida a Internet.
- Módulo pensado para Odoo 19 (OWL). Puede requerir ajustes menores en otras versiones.
