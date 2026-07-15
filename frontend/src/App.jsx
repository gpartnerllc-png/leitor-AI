import React, { useRef, useState } from 'react';
import './App.css';

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState(null);
  
  // Parâmetros para envio (Pode vir de um banco de dados posteriormente)
  const [tipo, setTipo] = useState('AGUA');
  const [leituraAnterior, setLeituraAnterior] = useState(1200);
  const [telefone, setTelefone] = useState('');

  const abrirCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      videoRef.current.srcObject = mediaStream;
      setStream(mediaStream);
    } catch (err) {
      alert("Erro ao acessar câmera: " + err.message);
    }
  };

  const capturarEProcessar = async () => {
    setProcessando(true);
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);

    try {
      // URL do seu Worker gerado pela Cloudflare
      const response = await fetch('https://SEU_WORKER_CLOUDFLARE.workers.dev/processar-leitura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, tipo, leituraAnterior: Number(leituraAnterior), telefone })
      });
      const data = await response.json();
      
      if (data.sucesso) {
        setResultado(data.dados);
        // Fechar câmera
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      } else {
        alert("Erro na IA: " + data.erro);
      }
    } catch (err) {
      alert("Falha de conexão com a infraestrutura.");
    }
    setProcessando(false);
  };

  return (
    <div className="container">
      <header className="header">
        <h1>SandxCDD Leitura</h1>
        <p>Inteligência de Borda</p>
      </header>

      {!resultado ? (
        <div className="capture-area">
          <div className="controls">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="AGUA">Saneago - Água (m³)</option>
              <option value="ENERGIA">Equatorial - Energia (kWh)</option>
            </select>
            <input type="number" placeholder="Leitura Mês Passado" value={leituraAnterior} onChange={e => setLeituraAnterior(e.target.value)} />
            <input type="text" placeholder="WhatsApp do Cliente" value={telefone} onChange={e => setTelefone(e.target.value)} />
          </div>

          <div className="camera-box">
            <video ref={videoRef} autoPlay playsInline hidden={!stream}></video>
            <canvas ref={canvasRef} hidden></canvas>
            {!stream && <button className="btn btn-blue" onClick={abrirCamera}>Ativar Câmera Scanner</button>}
          </div>

          {stream && (
             <button className={`btn ${processando ? 'btn-processando' : 'btn-green'}`} onClick={capturarEProcessar} disabled={processando}>
               {processando ? 'IA Analisando Padrão...' : 'Capturar e Calcular'}
             </button>
          )}
        </div>
      ) : (
        <div className="dashboard-kpi">
          <h2>📊 KPI de Consumo Gerado</h2>
          <div className="card">
            <p><strong>Tipo:</strong> {tipo}</p>
            <p><strong>Leitura Atual Identificada:</strong> <span className="highlight">{resultado.leituraAtual}</span></p>
            <p><strong>Consumo Mensal:</strong> {resultado.consumo} {tipo === 'AGUA' ? 'm³' : 'kWh'}</p>
            <p className="total">Total: R$ {resultado.total.toFixed(2)}</p>
            <small>{resultado.discriminacao}</small>
          </div>
          <button className="btn btn-blue" onClick={() => setResultado(null)}>Nova Leitura</button>
        </div>
      )}
    </div>
  );
}
