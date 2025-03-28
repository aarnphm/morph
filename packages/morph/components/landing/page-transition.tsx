"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function PageTransition({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const transitionRef = useRef<HTMLDivElement>(null);

  // Effect for page transitions
  useEffect(() => {
    // Add event listener to Links with href="/vaults"
    const handleLinkClick = (e: Event) => {
      e.preventDefault();
      
      // Start the transition animation
      if (transitionRef.current) {
        transitionRef.current.classList.add("active");
        
        // Navigate after animation completes
        setTimeout(() => {
          router.push("/vaults");
        }, 600); // Slightly shorter than animation duration
      }
    };

    // Find all vault links
    const vaultLinks = document.querySelectorAll('a[href="/vaults"]');
    vaultLinks.forEach(link => {
      link.addEventListener("click", handleLinkClick);
    });

    return () => {
      vaultLinks.forEach(link => {
        link.removeEventListener("click", handleLinkClick);
      });
    };
  }, [router]);

  return (
    <>
      {children}
      <div 
        ref={transitionRef}
        className="fixed inset-0 z-50 pointer-events-none transition-transform duration-700 ease-in-out"
        style={{
          transform: "translateX(-100%)",
          background: "linear-gradient(90deg, rgba(22,163,74,0.9) 0%, rgba(22,163,74,0.4) 100%)"
        }}
      />
      <style jsx global>{`
        .active {
          transform: translateX(0) !important;
        }
      `}</style>
    </>
  );
} 