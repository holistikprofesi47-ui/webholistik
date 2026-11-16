import React, { useState } from 'react';

interface DataPasien {
  kodeBooking: string;
  noRM: string;
  namaPasien: string;
  noHp: string;
  email: string;
  jenisTerapi: string;
  lokasi: string;
  hari: string;
  tanggal: string;
  jam: string;
  status: string;
  jenisKelamin: string;
  usia: string;
}

export default function FormPendaftaranPasien() {
  const [formData, setFormData] = useState<DataPasien>({
    kodeBooking: 'BK-' + Math.floor(1000 + Math.random() * 9000),
    noRM: 'RM-' + Math.floor(100 + Math.random() * 900),
    namaPasien: '',
    noHp: '',
    email: '',
    jenisTerapi: 'Bekam Kering',
    lokasi: 'Klinik Holistik DipoCare',
    hari: 'Senin',
    tanggal: new Date().toISOString().split('T')[0],
    jam: '09:00',
    status: 'Terdaftar',
    jenisKelamin: 'Laki-laki',
    usia: ''
  });

  const [loading, setLoading] = useState(false);

  // URL Web App Google Apps Script Anda yang sudah terhubung
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby-k6rqj16Tquf3vKE2bg--87btsQ54N_mC5Gh_43HEMk3zS8c41S1Kwh_PQQy5Bi2zeg/exec";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      ...formData,
      waktuPendaftaran: new Date().toLocaleString()
    };

    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      alert('Data pendaftaran pasien berhasil dikirim ke Google Sheets!');
      
      // Reset form setelah berhasil
      setFormData((prev) => ({
        ...prev,
        kodeBooking: 'BK-' + Math.floor(1000 + Math.random() * 9000),
        namaPasien: '',
        noHp: '',
        email: '',
        usia: ''
      }));
      
    } catch (error) {
      console.error('Gagal mengirim data:', error);
      alert('Terjadi kesalahan saat menghubungkan ke server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-8 p-6 bg-white shadow-md rounded-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        Pendaftaran Pasien Klinik Holistik DipoCare
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Nama Pasien */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Nama Pasien</label>
          <input 
            type="text" 
            name="namaPasien"
            value={formData.namaPasien}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2 shadow-sm"
            required 
          />
        </div>

        {/* No HP / WhatsApp */}
        <div>
          <label className="block text-sm font-medium text-gray-700">No HP / WhatsApp</label>
          <input 
            type="text" 
            name="noHp"
            value={formData.noHp}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2 shadow-sm"
            required 
          />
        </div>

        {/* Jenis Kelamin & Usia */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Jenis Kelamin</label>
            <select 
              name="jenisKelamin"
              value={formData.jenisKelamin}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2 shadow-sm"
            >
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Usia (Tahun)</label>
            <input 
              type="number" 
              name="usia"
              value={formData.usia}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2 shadow-sm"
              required 
            />
          </div>
        </div>

        {/* Jenis Terapi */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Jenis Terapi</label>
          <select 
            name="jenisTerapi"
            value={formData.jenisTerapi}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2 shadow-sm"
          >
            <option value="Bekam Kering">Bekam Kering</option>
            <option value="Foot Soak Hydrotherapy">Foot Soak Hydrotherapy</option>
            <option value="Foot & Back Massage">Foot & Back Massage</option>
            <option value="Aromatherapy">Aromatherapy</option>
          </select>
        </div>

        {/* Tanggal Tindakan */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Tanggal Tindakan</label>
          <input 
            type="date" 
            name="tanggal"
            value={formData.tanggal}
            onChange={handleChange}
            className="mt-1 block w-full border border-gray-300 rounded-md p-2 shadow-sm"
            required 
          />
        </div>

        {/* Tombol Submit */}
        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-blue-600 text-white font-semibold p-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? 'Mengirim Data...' : 'Simpan & Daftarkan Pasien'}
        </button>

      </form>
    </div>
  );
}

