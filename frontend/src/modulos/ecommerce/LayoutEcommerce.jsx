import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Building2, Lock, Menu, X } from "lucide-react";
import "./ecommerce.css";
import { ProcesoCompraProvider } from "./ProcesoCompraContext";
import { HOTEL } from "./ecommerce.config";
import { Boton } from "./componentes/Boton";

// Rutas del proceso de compra: header reducido ("Pago seguro").
const RUTAS_COMPRA = ["/web/datos", "/web/pago"];

function Logo() {
  return (
    <Link to="/web" className="ec-logo" aria-label={`${HOTEL.nombre} — inicio`}>
      <span className="ec-logo__marca">
        <Building2 size={22} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span>
        <span className="ec-logo__nombre">{HOTEL.nombre}</span>
        <span className="ec-logo__bajada">{HOTEL.bajada}</span>
      </span>
    </Link>
  );
}

function Header({ oscuro }) {
  // El menú móvil se cierra al navegar: LayoutEcommerce le pasa key={pathname}.
  const [abierto, setAbierto] = useState(false);

  const clases = ["ec-header", oscuro ? "ec-header--oscuro" : "", abierto ? "ec-header--menu-abierto" : ""].filter(Boolean).join(" ");
  return (
    <header className={clases}>
      <div className="ec-contenedor ec-header__interior">
        <Logo />
        <button
          type="button"
          className="ec-menu-boton"
          aria-expanded={abierto}
          aria-controls="ec-menu-principal"
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setAbierto((a) => !a)}
        >
          {abierto ? <X size={24} strokeWidth={1.7} aria-hidden="true" /> : <Menu size={24} strokeWidth={1.7} aria-hidden="true" />}
        </button>
        <nav id="ec-menu-principal" className="ec-nav" aria-label="Principal">
          <Link className="ec-nav__link" to="/web#habitaciones">
            Habitaciones
          </Link>
          <Link className="ec-nav__link" to="/web#ubicacion">
            Ubicación
          </Link>
          <Link className="ec-nav__link" to="#contacto">
            Contacto
          </Link>
        </nav>
        <div className="ec-header__acciones">
          <Boton variante="secundario" formulario to="/web/mi-reserva">
            Mi reserva
          </Boton>
        </div>
      </div>
    </header>
  );
}

function HeaderCompra() {
  return (
    <header className="ec-header">
      <div className="ec-contenedor ec-header__interior">
        <Logo />
        <p className="ec-header__seguro">
          <Lock size={18} strokeWidth={1.7} aria-hidden="true" />
          <span>Pago seguro · conexión cifrada</span>
        </p>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="ec-footer" id="contacto">
      <div className="ec-contenedor">
        <div className="ec-footer__grilla">
          <div>
            <Link to="/web" className="ec-logo">
              <span className="ec-logo__marca">
                <Building2 size={22} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <span>
                <span className="ec-logo__nombre">{HOTEL.nombre}</span>
                <span className="ec-logo__bajada">{HOTEL.bajada}</span>
              </span>
            </Link>
            <p className="ec-footer__texto">Reservá directo con el hotel: precio final, confirmación inmediata y consulta de tu reserva con tu código.</p>
          </div>
          <div>
            <p className="ec-footer__titulo">El hotel</p>
            <ul className="ec-footer__lista">
              <li>
                <Link to="/web#habitaciones">Habitaciones</Link>
              </li>
              <li>
                <Link to="/web#ubicacion">Ubicación</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="ec-footer__titulo">Tu reserva</p>
            <ul className="ec-footer__lista">
              <li>
                <Link to="/web/mi-reserva">Mi reserva</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="ec-footer__titulo">Contacto</p>
            <ul className="ec-footer__lista">
              <li>{HOTEL.direccion}</li>
              <li>{HOTEL.telefono}</li>
              <li>{HOTEL.email}</li>
            </ul>
          </div>
        </div>
        <div className="ec-footer__pie">
          <span>© 2026 {HOTEL.nombre} · Sistema de Gestión Hotelera</span>
          <span>Precios finales en pesos argentinos (ARS), IVA incluido</span>
        </div>
        <p className="ec-footer__demo">Sitio de demostración · Proyecto académico de Sistemas III. Los datos de contacto son ficticios.</p>
      </div>
    </footer>
  );
}

// Envoltorio del sitio web nuevo. No usa el
// Layout del sistema: todo lo visual vive dentro de .ec-raiz.
export function LayoutEcommerce() {
  const { pathname, hash } = useLocation();
  const enCompra = RUTAS_COMPRA.includes(pathname);
  const enInicio = pathname === "/web" || pathname === "/web/";

  // Cada pantalla nueva arranca arriba (salvo links a una sección: #...).
  useEffect(() => {
    if (!hash) {
      window.scrollTo?.(0, 0);
      return;
    }
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.({ behavior: "smooth" });
  }, [pathname, hash]);

  return (
    <div className="ec-raiz">
      <a href="#ec-contenido" className="ec-visualmente-oculto">
        Saltar al contenido
      </a>
      {enCompra ? <HeaderCompra /> : <Header key={pathname} oscuro={enInicio} />}
      <ProcesoCompraProvider>
        <main id="ec-contenido" className="ec-main">
          <Outlet />
        </main>
      </ProcesoCompraProvider>
      {!enCompra && <Footer />}
    </div>
  );
}
