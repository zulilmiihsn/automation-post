import { useState, useEffect, useCallback } from 'react';
import { Plus, ArrowLeft, Bot, MapPin, Image as ImageIcon } from 'lucide-react';
import { api } from '../services/api';
import { useAutoSave, SaveStatus } from '../hooks/useAutoSave';
import { useToast } from '../components/ToastContext';

import ListingMediaGallery from '../components/ListingMediaGallery';
import ListingDynamicAttrs from '../components/ListingDynamicAttrs';
import ListingEngineControls from '../components/ListingEngineControls';

export default function ListingsEdit({ listing: initialListing, onBack, onSave }) {
  const [listing, setListing] = useState({
    ...initialListing,
    attributes: initialListing.attributes || {}
  });
  const [config, setConfig] = useState({ FIELD_MAP: {}, FIELD_CONFIG: {}, CATEGORIES: [] });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generatingTags, setGeneratingTags] = useState(false);
  const [generatingFields, setGeneratingFields] = useState(false);
  const toast = useToast();

  const saveFn = useCallback(
    async (currentListing) => {
      if (currentListing.id) {
        await api.updateListing(currentListing.id, currentListing);
      } else {
        if (currentListing.title || currentListing.price > 0 || currentListing.description) {
          const res = await api.createListing(currentListing);
          if (res && res.id) {
            setListing(prev => ({ ...prev, id: res.id }));
          }
        }
      }
    },
    []
  );
  const { triggerSave, status } = useAutoSave(saveFn, 800);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await api.getConfig();
        setConfig({
          FIELD_MAP: data.FIELD_MAP || {},
          FIELD_CONFIG: data.FIELD_CONFIG || {},
          CATEGORIES: Object.keys(data.FIELD_MAP || {})
        });
      } catch (err) {
        console.error("Failed to fetch config", err);
      } finally {
        setLoadingConfig(false);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    const handlePaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const ext = file.type.split('/')[1] || 'png';
            const renamedFile = new File([file], `pasted-image-${Date.now()}-${i}.${ext}`, { type: file.type });
            imageFiles.push(renamedFile);
          }
        }
      }

      if (imageFiles.length === 0) return;

      e.preventDefault();
      setUploading(true);

      const formData = new FormData();
      for (const file of imageFiles) {
        formData.append('photos', file);
      }

      try {
        const data = await api.uploadPhotos(formData);
        const newUploadedPhotos = data.files.map((f) => `/assets/${f}`);
        const existingPhotos = listing.photos || [];
        const updatedListing = {
          ...listing,
          photoDir: data.folderPath,
          photos: [...existingPhotos, ...newUploadedPhotos]
        };

        setListing(updatedListing);

        if (updatedListing.id) {
          await api.updateListing(updatedListing.id, updatedListing);
        } else {
          const res = await api.createListing(updatedListing);
          if (res && res.id) {
            setListing(prev => ({ ...prev, id: res.id }));
          }
        }
      } catch (err) {
        console.error("Paste upload failed", err);
        toast.error(`Gagal upload paste gambar: ${err.message}`);
      } finally {
        setUploading(false);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [listing]);

  const handleChange = (field, value) => {
    const updated = { ...listing, [field]: value };
    
    if (field === 'category') {
      const newPresets = config.FIELD_MAP[value] || [];
      const allFbFields = Object.values(config.FIELD_MAP).flat();
      const newAttributes = { ...(updated.attributes || {}) };
      
      Object.keys(newAttributes).forEach((key) => {
        if (allFbFields.includes(key) && !newPresets.includes(key)) {
          if (!newAttributes[key] || newAttributes[key].trim() === '') {
            delete newAttributes[key];
          }
        }
      });
      
      newPresets.forEach((p) => {
        if (!(p in newAttributes)) {
          newAttributes[p] = '';
        }
      });
      
      updated.attributes = newAttributes;
    }
    
    setListing(updated);
    triggerSave(updated);
  };

  const handleAttributeChange = (attr, value) => {
    const updated = {
      ...listing,
      attributes: {
        ...(listing.attributes || {}),
        [attr]: value
      }
    };
    setListing(updated);
    triggerSave(updated);
  };

  const handleAutoFill = async () => {
    if (!listing.description || listing.description.trim() === '') {
      toast.error("Isi deskripsi terlebih dahulu sebelum auto-fill.");
      return;
    }

    setGeneratingFields(true);
    try {
      const res = await api.generateFields({ description: listing.description });
      if (res && res.success) {
        const updated = { ...listing };
        if (res.title) updated.title = res.title;
        if (res.price) updated.price = res.price;
        if (res.condition) updated.condition = res.condition;
        if (res.category) updated.category = res.category;
        if (res.tags) updated.tags = res.tags;
        if (res.description) updated.description = res.description;
        if (res.attributes) updated.attributes = res.attributes;
        
        setListing(updated);
        triggerSave(updated);
      }
    } catch (err) {
      console.error(err);
      toast.error(`Gagal generate fields: ${err.message}`);
    } finally {
      setGeneratingFields(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('photos', files[i]);
    }

    try {
      const data = await api.uploadPhotos(formData);
      const newPhotos = data.files.map((f) => `/assets/${f}`);
      
      const updatedListing = {
        ...listing,
        photoDir: data.folderPath,
        photos: newPhotos
      };
      
      setListing(updatedListing);
      
      if (updatedListing.id) {
        await api.updateListing(updatedListing.id, updatedListing);
      } else {
        const res = await api.createListing(updatedListing);
        if (res && res.id) {
          setListing(prev => ({ ...prev, id: res.id }));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(`Gagal upload: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const formatRupiah = (val) => {
    if (!val && val !== 0) return "";
    const number = typeof val === "string" ? val.replace(/[^0-9]/g, "") : val;
    if (number === "") return "";
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(number).replace(/,00$/, "");
  };

  const isVehicleAliases = [
    "Jenis Kendaraan", "Jenis kendaraan", "Kendaraan", "Vehicles"
  ];
  const isVehicle = isVehicleAliases.some(
    (alias) =>
      listing.category?.toLowerCase() === alias.toLowerCase() ||
      listing.attributes?.[alias]
  );

  const getVisibleAttributes = () => {
    let attrs = config.FIELD_MAP[listing.category] || [];
    const attributes = listing.attributes || {};

    if (listing.category === "Kendaraan") {
      const vehicleType = attributes["Jenis kendaraan"] || "";
      if (vehicleType === "Sepeda Motor") {
        attrs = attrs.filter(a => [
          "Jenis kendaraan", "Tahun", "Merek", "Model", "Jarak Tempuh", "Warna eksterior", "Jenis bahan bakar", "Transmisi"
        ].includes(a));
      } else if (vehicleType === "Mobil/Truk") {
        attrs = attrs.filter(a => [
          "Jenis kendaraan", "Tahun", "Merek", "Model", "Jarak Tempuh", "Tipe bodi", "Transmisi", "Jenis bahan bakar", "Warna eksterior", "Warna interior", "Kapasitas Penumpang", "Kondisi Kendaraan", "Status surat", "VIN"
        ].includes(a));
      } else if (vehicleType === "Trailer") {
        attrs = attrs.filter(a => [
          "Jenis kendaraan", "Tahun", "Merek", "Model", "Panjang (ft)", "Warna eksterior", "Warna interior"
        ].includes(a));
      } else if (vehicleType === "Perahu") {
        attrs = attrs.filter(a => [
          "Jenis kendaraan", "Tahun", "Merek", "Model", "Panjang (ft)", "Warna eksterior", "Warna interior", "Jenis bahan bakar"
        ].includes(a));
      } else if (["Powersport", "RV/Camper", "Komersial/Industri", "Lainnya"].includes(vehicleType)) {
        attrs = attrs.filter(a => [
          "Jenis kendaraan", "Tahun", "Merek", "Model", "Warna eksterior", "Warna interior", "Jenis bahan bakar"
        ].includes(a));
      } else if (!vehicleType) {
        attrs = ["Jenis kendaraan"];
      }
    } else if (listing.category === "Properti") {
      const propertyType = attributes["Jenis properti"] || "";
      if (propertyType === "Tanah") {
        attrs = attrs.filter(a => ![
          "Jumlah Kamar Tidur", "Jumlah Kamar Mandi", "Luas Bangunan"
        ].includes(a));
      } else if (propertyType === "Ruko" || propertyType === "Kantor") {
        attrs = attrs.filter(a => !["Jumlah Kamar Tidur"].includes(a));
      }
    }

    return attrs;
  };

  const dynamicAttrs = getVisibleAttributes();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button 
            className="btn btn-outline" 
            style={{ padding: '8px', borderRadius: '50%' }}
            onClick={() => { if(onSave) onSave(listing); if(onBack) onBack(); }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 500, margin: '0 0 4px 0', letterSpacing: '-0.03em', color: 'var(--text)' }}>
              {listing.title || 'Produk Baru'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span>ID: {listing.id ? String(listing.id).substring(0,8) : 'Belum Disimpan'}</span>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border-light)' }}></span>
              <SaveStatus status={status} />
            </div>
          </div>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '32px' }}>
        
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          <ListingMediaGallery 
            listing={listing} 
            isVehicle={isVehicle} 
            uploading={uploading} 
            onFileUpload={handleFileUpload} 
          />
          
          {/* PRIMARY DETAILS */}
          <div style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 500, margin: 0 }}>Detail Utama</h3>
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>Judul Produk</label>
                <input 
                  type="text" 
                  value={listing.title || ''} 
                  onChange={(e) => handleChange('title', e.target.value)} 
                  placeholder="Masukkan judul produk..."
                  style={{ width: '100%', padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', outline: 'none', fontSize: '0.95rem' }} 
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>Harga</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 500 }}>Rp</div>
                    <input 
                      type="text" 
                      value={formatRupiah(listing.price).replace('Rp', '').trim()} 
                      onChange={(e) => handleChange('price', e.target.value.replace(/[^0-9]/g, ''))} 
                      placeholder="0"
                      style={{ width: '100%', padding: '14px 16px 14px 44px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', outline: 'none', fontSize: '0.95rem', fontWeight: 500 }} 
                    />
                  </div>
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>Kondisi</label>
                  <select 
                    value={listing.condition || ''} 
                    onChange={(e) => handleChange('condition', e.target.value)} 
                    style={{ width: '100%', padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', outline: 'none', fontSize: '0.95rem' }}
                  >
                    <option value="">Pilih kondisi</option>
                    <option value="Baru">Baru (New)</option>
                    <option value="Bekas - Seperti Baru">Bekas - Seperti Baru (Like New)</option>
                    <option value="Bekas - Baik">Bekas - Baik (Good)</option>
                    <option value="Bekas - Cukup">Bekas - Cukup (Fair)</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>Kategori</label>
                <select 
                  value={listing.category || ''} 
                  onChange={(e) => handleChange('category', e.target.value)} 
                  style={{ width: '100%', padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', outline: 'none', fontSize: '0.95rem' }}
                >
                  <option value="">Pilih kategori</option>
                  {config.CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {!loadingConfig && (
            <ListingDynamicAttrs 
              dynamicAttrs={dynamicAttrs}
              config={config}
              listing={listing}
              handleAttributeChange={handleAttributeChange}
            />
          )}
          
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* DESCRIPTION */}
          <div style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 500, margin: 0 }}>Deskripsi</h3>
              <button 
                type="button"
                onClick={handleAutoFill}
                disabled={generatingFields || !listing.description}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.75rem', cursor: generatingFields || !listing.description ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', opacity: generatingFields || !listing.description ? 0.5 : 1, transition: 'all 0.2s' }}
                onMouseOver={(e) => { if(!generatingFields && listing.description) e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
                onMouseOut={(e) => { if(!generatingFields && listing.description) e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <Bot size={14} />
                {generatingFields ? 'Auto-filling...' : 'AI Auto-fill from Desc'}
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <textarea 
                rows="8" 
                value={listing.description || ''} 
                onChange={(e) => handleChange('description', e.target.value)} 
                placeholder="Tulis deskripsi yang menarik untuk produk Anda..."
                style={{ width: '100%', padding: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', outline: 'none', resize: 'vertical', fontSize: '0.95rem', lineHeight: 1.6 }}
              ></textarea>
            </div>
          </div>

          {/* META & LOCATION */}
          <div style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 500, margin: 0 }}>Meta Penemuan</h3>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>Tags / Keywords</label>
                  {listing.title && (
                    <button 
                      type="button"
                      onClick={async () => {
                        setGeneratingTags(true);
                        try {
                          const res = await api.generateTags({
                            title: listing.title,
                            location: listing.location || 'Tanjungredep',
                            category: listing.category || '',
                            condition: listing.condition || 'Bekas - Baik'
                          });
                          if (res && res.tags) {
                            const updated = { ...listing, tags: res.tags };
                            setListing(updated);
                            triggerSave(updated);
                          }
                        } catch (err) {
                          console.error(err);
                          toast.error(`Gagal generate tags: ${err.message}`);
                        } finally {
                          setGeneratingTags(false);
                        }
                      }}
                      disabled={generatingTags}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                    >
                      <Bot size={12} />
                      {generatingTags ? 'Generating...' : 'AI Generate'}
                    </button>
                  )}
                </div>
                <input 
                  type="text" 
                  value={listing.tags || ''} 
                  onChange={(e) => handleChange('tags', e.target.value)} 
                  placeholder={generatingTags ? "AI is generating 20 tags..." : "e.g. laptop, gaming, asus"}
                  disabled={generatingTags}
                  style={{ width: '100%', padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.9rem', opacity: generatingTags ? 0.6 : 1 }} 
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>SKU</label>
                  <input 
                    type="text" 
                    value={listing.sku || ''} 
                    onChange={(e) => handleChange('sku', e.target.value)} 
                    placeholder="Optional SKU"
                    style={{ width: '100%', padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.9rem' }} 
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>Lokasi</label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                      <MapPin size={14} />
                    </div>
                    <input 
                      type="text" 
                      value={listing.location || 'Tanjungredep'} 
                      onChange={(e) => handleChange('location', e.target.value)} 
                      style={{ width: '100%', padding: '12px 14px 12px 34px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.9rem' }} 
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>Ketersediaan Stok</label>
                <select 
                  value={listing.availability || ''} 
                  onChange={(e) => handleChange('availability', e.target.value)} 
                  style={{ width: '100%', padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.9rem' }}
                >
                  <option value="Tawarkan Hanya Satu Saja">Tawarkan Hanya Satu Saja (Single Item)</option>
                  <option value="Tawarkan sebagai Tersedia">Tawarkan sebagai Tersedia (In Stock)</option>
                </select>
              </div>

            </div>
          </div>

          <ListingEngineControls 
            listing={listing} 
            handleChange={handleChange} 
          />

        </div>
      </div>
    </div>
  );
}
