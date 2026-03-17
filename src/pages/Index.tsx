import { useState } from "react";
import DropZone from "@/components/DropZone";
import OCRWorkspace from "@/components/OCRWorkspace";
import { AnimatePresence, motion } from "framer-motion";

const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  return (
    <AnimatePresence mode="wait">
      {selectedFile ? (
        <motion.div
          key="workspace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <OCRWorkspace
            imageFile={selectedFile}
            onBack={() => setSelectedFile(null)}
          />
        </motion.div>
      ) : (
        <motion.div
          key="dropzone"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <DropZone onImageSelect={setSelectedFile} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Index;
