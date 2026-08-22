import Link from "next/link";

export default function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Compra Negocio, inicio">
      <span className="brand-mark" aria-hidden="true"><span>C</span><span>N</span></span>
      <span className="brand-lockup">
        <b>Compra Negocio</b>
        <small>Negocios digitales</small>
      </span>
    </Link>
  );
}

