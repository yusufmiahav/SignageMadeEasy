// NDI source discovery helper for ndiPlayer.ts's findSources() — runs NDI's own
// discovery for a fixed window, then prints every source's NDI name, one per line,
// and exits. Deliberately tiny and single-purpose: this is the one binary that needs
// the full NDI SDK (headers + lib) rather than just the SDK's runtime library, which
// gst-plugin-ndi's own build doesn't need at all.
//
// Build: see Makefile in this directory. Run with no arguments.

#include <Processing.NDI.Lib.h>
#include <stdio.h>

// Long enough for sources to announce themselves over mDNS on a typical LAN without
// making "Scan for sources" feel unresponsive in the control app's dialog.
#define DISCOVERY_WAIT_MS 4000

int main(void) {
  if (!NDIlib_initialize()) {
    fprintf(stderr, "NDIlib_initialize failed — is libndi installed correctly?\n");
    return 1;
  }

  NDIlib_find_create_t find_create = {0};
  find_create.show_local_sources = true;
  find_create.p_groups = NULL;
  find_create.p_extra_ips = NULL;

  NDIlib_find_instance_t finder = NDIlib_find_create_v2(&find_create);
  if (!finder) {
    fprintf(stderr, "NDIlib_find_create_v2 failed\n");
    NDIlib_destroy();
    return 1;
  }

  NDIlib_find_wait_for_sources(finder, DISCOVERY_WAIT_MS);

  uint32_t num_sources = 0;
  const NDIlib_source_t* sources = NDIlib_find_get_current_sources(finder, &num_sources);
  for (uint32_t i = 0; i < num_sources; i++) {
    printf("%s\n", sources[i].p_ndi_name);
  }
  fflush(stdout);

  NDIlib_find_destroy(finder);
  NDIlib_destroy();
  return 0;
}
