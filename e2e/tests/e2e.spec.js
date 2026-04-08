const { test, expect } = require('@playwright/test');

test('Flujo completo: compra -> guardar orden -> admin confirma', async ({ page, request }) => {
  // 1) Ir a la página de compra
  await page.goto('/compra.html');

  // Asegurar que la página cargó
  await expect(page.locator('#numerosGrid')).toBeVisible();

  // 2) Generar números con la máquina: indicar cantidad 3 y generar
  await page.fill('#cantidadNumeros', '3');
  await page.waitForFunction(() => {
    const btn = document.getElementById('btnGenerarNumeros');
    return btn && btn.disabled === false;
  }, null, { timeout: 15000 });
  await page.click('#btnGenerarNumeros');

  // Esperar resultado de la máquina
  await expect(page.locator('#maquinaResultado')).toBeVisible({ timeout: 5000 });

  // 3) Agregar números al carrito
  await page.click('#btnAgregarSuerte');

  // Verificar que el contador cambió
  const carritoCount = await page.locator('.carrito-count').innerText();
  expect(parseInt(carritoCount)).toBeGreaterThan(0);

  // Asegurar que la orden generada sea única (evitar colisiones con runs previos)
  await page.evaluate(() => {
    if (window.rifaplusConfig) {
      window.rifaplusConfig.orderCounter = Date.now();
    }
  });

  // 4) Abrir carrito y proceder a compra (flujo actual)
  await page.click('#carritoNav');
  await expect(page.locator('#carritoModal')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#btnProcederCarrito')).toBeEnabled({ timeout: 5000 });
  await page.click('#btnProcederCarrito');
  await expect(page.locator('#modalContacto')).toHaveClass(/show/);

  // 5) Completar el formulario de contacto
  await page.fill('#clienteNombre', 'Automated');
  await page.fill('#clienteApellidos', 'Tester');
  await page.fill('#clienteWhatsapp', '4499111111');
  await page.selectOption('#clienteEstado', 'Querétaro');
  await page.fill('#clienteCiudad', 'Queretaro');

  // Patch guardarClienteEnStorage to append a valid email to localStorage
  await page.evaluate(() => {
    try {
      const original = window.guardarClienteEnStorage;
      window.guardarClienteEnStorage = function(...args) {
        const result = original(...args);
        try {
          const clave = 'rifaplus_cliente';
          const c = JSON.parse(localStorage.getItem(clave) || '{}');
          c.email = c.email || `e2e+${Date.now()}@test.local`;
          localStorage.setItem(clave, JSON.stringify(c));
        } catch (e) {
          // ignore
        }
        return result;
      };
    } catch (e) {
      // if function not present, ignore
    }
  });

  await page.click('#btnContinuarContacto');

  // 6) Seleccionar cuenta de pago y abrir orden formal
  await expect(page.locator('#modalSeleccionCuenta')).toHaveClass(/show/, { timeout: 5000 });
  await page.locator('#modalSeleccionCuenta .stack-label').first().click();
  await expect(page.locator('#modalOrdenFormal')).toBeVisible({ timeout: 5000 });

  // Asegurar que el cliente tenga un email válido para pasar validaciones del backend
  await page.evaluate(() => {
    const clave = 'rifaplus_cliente';
    const cliente = JSON.parse(localStorage.getItem(clave) || '{}');
    cliente.email = cliente.email || `e2e+${Date.now()}@test.local`;
    localStorage.setItem(clave, JSON.stringify(cliente));
  });

  // 7) Confirmar orden formal
  // Debug: comprobar rifaplus_cliente en localStorage antes de generar orden
  const clienteStorage = await page.evaluate(() => localStorage.getItem('rifaplus_cliente'));
  console.log('DEBUG rifaplus_cliente BEFORE generar orden:', clienteStorage);

  await page.click('#btnContinuarOrdenFormal');

  // Ensure ordenActual and localStorage contain a valid email before sending to backend
  await page.evaluate(() => {
    try {
      const clave = 'rifaplus_orden_actual';
      const obj = JSON.parse(localStorage.getItem(clave) || '{}');
      obj.cliente = obj.cliente || {};
      obj.cliente.email = obj.cliente.email || `e2e+${Date.now()}@test.local`;
      localStorage.setItem(clave, JSON.stringify(obj));
      // also set in-memory variable used by orden-formal.js
      if (window.ordenActual) {
        window.ordenActual.cliente = window.ordenActual.cliente || {};
        window.ordenActual.cliente.email = window.ordenActual.cliente.email || `e2e+${Date.now()}@test.local`;
      }
    } catch (e) {
      // ignore
    }
  });

  // Debug: obtener ordenActual en memoria
  const ordenEnMemoria = await page.evaluate(() => {
    try { return window.ordenActual || null; } catch (e) { return { error: e.message }; }
  });
  console.log('DEBUG ordenEnMemoria=', ordenEnMemoria);

  // 8) Reutilizar la orden creada por el propio flujo del frontend
  const ordenId = ordenEnMemoria?.ordenId;
  expect(ordenId).toBeTruthy();

  await expect.poll(async () => {
    const resp = await request.get(`http://localhost:3000/api/ordenes/${ordenId}`);
    return resp.status();
  }, {
    timeout: 15000,
    message: `La orden ${ordenId} no quedó visible en la API a tiempo`
  }).toBe(200);

  // 10) Loguear en admin vía API para obtener token
  const loginResp = await request.post('http://localhost:3000/api/admin/login', {
    data: { username: 'admin', password: 'admin123' }
  });
  expect(loginResp.status()).toBe(200);
  const loginJson = await loginResp.json();
  const token = loginJson.token;
  expect(token).toBeTruthy();

  // 11) Confirmar orden con PATCH
  const patchResp = await request.patch(`http://localhost:3000/api/ordenes/${ordenId}/estado`, {
    data: { estado: 'confirmada' },
    headers: { Authorization: `Bearer ${token}` }
  });
  const patchJson = await patchResp.json();
  expect(patchResp.ok()).toBeTruthy();
  expect(patchJson.success).toBe(true);

  // 12) Verificar desde API que orden cambió de estado
  const listResp = await request.get('http://localhost:3000/api/ordenes', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listJson = await listResp.json();
  const found = listJson.data.find(o => o.ordenId === ordenId || o.id === ordenId);
  expect(found).toBeTruthy();
  expect(found.estado === 'confirmada' || found.estado === 'confirmada').toBeTruthy();
});
