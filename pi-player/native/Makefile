# Builds the ndi-find discovery helper (see ndi-find.c). Needs the NDI SDK's headers
# at build time and its shared library discoverable at both build and run time — see
# pi-player/README.md's "NDI live sources" section for getting the SDK onto the Pi.
#
# Usage:
#   make NDI_INCLUDE="$HOME/NDI SDK for Linux/include"
#   sudo make install
#
# NDI_INCLUDE defaults to the path the SDK's own Linux installer/tarball extracts to.
# The library itself (-lndi) is expected to already be installed system-wide (e.g.
# copied to /usr/local/lib + `ldconfig`) — this Makefile doesn't touch that.

CC ?= gcc
CFLAGS ?= -O2 -Wall
NDI_INCLUDE ?= $(HOME)/NDI SDK for Linux/include
LDLIBS = -lndi
PREFIX ?= /opt/signage/bin

ndi-find: ndi-find.c
	$(CC) $(CFLAGS) -I"$(NDI_INCLUDE)" $< $(LDLIBS) -o $@

install: ndi-find
	install -d "$(PREFIX)"
	install -m 755 ndi-find "$(PREFIX)/ndi-find"

clean:
	rm -f ndi-find

.PHONY: install clean
